import logging
import os
from decimal import Decimal
from typing import Literal

import razorpay
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import CartItem, Order, OrderItem, Payment, Product, User
from app.routers.users import get_current_user

logger = logging.getLogger(__name__)

load_dotenv()

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")

razorpay_client = None
if RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET:
    razorpay_client = razorpay.Client(
        auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET)
    )

router = APIRouter(prefix="/api/orders", tags=["Orders"])


class CheckoutRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=150)
    phone: str = Field(min_length=10, max_length=20)
    address: str = Field(min_length=5, max_length=1000)
    city: str = Field(min_length=2, max_length=100)
    state: str = Field(min_length=2, max_length=100)
    postal_code: str = Field(min_length=5, max_length=10)
    payment_method: Literal["COD"] = "COD"


class OnlineCheckoutRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=150)
    phone: str = Field(min_length=10, max_length=20)
    address: str = Field(min_length=5, max_length=1000)
    city: str = Field(min_length=2, max_length=100)
    state: str = Field(min_length=2, max_length=100)
    postal_code: str = Field(min_length=5, max_length=10)


class VerifyPaymentRequest(BaseModel):
    order_id: int
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


def get_razorpay_client():
    if razorpay_client is None:
        raise HTTPException(
            status_code=503,
            detail="Razorpay is not configured. Check your .env file.",
        )
    return razorpay_client


def get_cart_and_total(db: Session, user_id: int):
    """Validate cart products and calculate total using database prices."""
    cart_items = (
        db.query(CartItem)
        .filter(CartItem.user_id == user_id)
        .with_for_update()
        .all()
    )

    if not cart_items:
        raise HTTPException(status_code=400, detail="Your cart is empty")

    total = Decimal("0.00")
    order_lines = []

    for cart_item in cart_items:
        product = (
            db.query(Product)
            .filter(
                Product.id == cart_item.product_id,
                Product.is_active.is_(True),
            )
            .with_for_update()
            .first()
        )

        if not product:
            raise HTTPException(
                status_code=400,
                detail=f"Product ID {cart_item.product_id} is unavailable",
            )

        if cart_item.quantity <= 0:
            raise HTTPException(
                status_code=400,
                detail="Invalid cart quantity",
            )

        if cart_item.quantity > product.stock:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for {product.name}",
            )

        unit_price = Decimal(str(product.price))
        subtotal = unit_price * cart_item.quantity
        total += subtotal

        order_lines.append(
            {
                "product_id": product.id,
                "product_name": product.name,
                "quantity": cart_item.quantity,
                "unit_price": unit_price,
                "subtotal": subtotal,
            }
        )

    return cart_items, order_lines, total


def add_order_items(db: Session, order_id: int, order_lines: list):
    for line in order_lines:
        db.add(
            OrderItem(
                order_id=order_id,
                product_id=line["product_id"],
                product_name=line["product_name"],
                unit_price=line["unit_price"],
                quantity=line["quantity"],
                subtotal=line["subtotal"],
            )
        )


@router.post("/checkout", status_code=201)
def checkout(
    data: CheckoutRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        # 1. Validate cart and calculate total from database prices.
        cart_items, order_lines, total = get_cart_and_total(
            db, current_user.id
        )

        # 2. Create the COD order.
        order = Order(
            user_id=current_user.id,
            total_amount=total,
            full_name=data.full_name,
            phone=data.phone,
            address=data.address,
            city=data.city,
            state=data.state,
            postal_code=data.postal_code,
            payment_method="COD",
            status="PLACED",
            payment_status="PENDING",
        )
        db.add(order)
        db.flush()

        # 3. Add order items.
        add_order_items(db, order.id, order_lines)

        # 4. Recheck and reduce product stock.
        for line in order_lines:
            product = (
                db.query(Product)
                .filter(Product.id == line["product_id"])
                .with_for_update()
                .first()
            )

            if product is None:
                raise HTTPException(
                    status_code=400,
                    detail=f"Product ID {line['product_id']} not found",
                )

            if product.stock < line["quantity"]:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient stock for {product.name}",
                )

            product.stock -= line["quantity"]

        # 5. Remove purchased items from the cart.
        for cart_item in cart_items:
            db.delete(cart_item)

        # 6. Commit the transaction.
        db.commit()
        db.refresh(order)

        return {
            "message": "Order placed successfully",
            "order_id": order.id,
            "status": order.status,
            "payment_method": order.payment_method,
            "payment_status": order.payment_status,
            "total_amount": str(order.total_amount),
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception as error:
        db.rollback()
        logger.exception("COD checkout failed for user_id=%s", current_user.id)
        raise HTTPException(
            status_code=500,
            detail="Unable to place order. Check the FastAPI terminal for the actual error.",
        ) from error


@router.post("/online/create", status_code=201)
def create_online_order(
    data: OnlineCheckoutRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client = get_razorpay_client()

    try:
        cart_items, order_lines, total = get_cart_and_total(
            db, current_user.id
        )

        # Create a pending local order.
        order = Order(
            user_id=current_user.id,
            total_amount=total,
            full_name=data.full_name,
            phone=data.phone,
            address=data.address,
            city=data.city,
            state=data.state,
            postal_code=data.postal_code,
            payment_method="RAZORPAY",
            status="PENDING_PAYMENT",
            payment_status="PENDING",
        )
        db.add(order)
        db.flush()
        add_order_items(db, order.id, order_lines)
        db.commit()
        db.refresh(order)

        # Razorpay expects amount in paise, not rupees.
        amount_paise = int(total * 100)

        try:
            gateway_order = client.order.create(
                {
                    "amount": amount_paise,
                    "currency": "INR",
                    "receipt": f"order_{order.id}",
                    "notes": {
                        "local_order_id": str(order.id),
                        "user_id": str(current_user.id),
                    },
                }
            )
        except Exception as gateway_error:
            logger.exception(
                "Razorpay order creation failed for local order_id=%s",
                order.id,
            )
            order.status = "PAYMENT_FAILED"
            db.commit()
            raise HTTPException(
                status_code=502,
                detail="Could not create Razorpay order. Please check Razorpay credentials/network and try again.",
            ) from gateway_error

        payment = Payment(
            order_id=order.id,
            gateway_order_id=gateway_order["id"],
            amount=total,
            currency="INR",
            status="CREATED",
        )
        db.add(payment)
        db.commit()

        return {
            "message": "Online payment order created",
            "order_id": order.id,
            "amount": amount_paise,
            "currency": "INR",
            "razorpay_order_id": gateway_order["id"],
            "razorpay_key_id": RAZORPAY_KEY_ID,
            "name": current_user.name,
            "email": current_user.email,
            "phone": data.phone,
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception as error:
        db.rollback()
        logger.exception(
            "Online order creation failed for user_id=%s",
            current_user.id,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Online order creation failed: {type(error).__name__}: {error}",
        ) from error


@router.post("/online/verify")
def verify_online_payment(
    data: VerifyPaymentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client = get_razorpay_client()

    order = (
        db.query(Order)
        .filter(
            Order.id == data.order_id,
            Order.user_id == current_user.id,
        )
        .with_for_update()
        .first()
    )

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.payment_method != "RAZORPAY":
        raise HTTPException(
            status_code=400,
            detail="This is not an online payment order",
        )

    if order.payment_status == "PAID":
        return {
            "message": "Payment already verified",
            "order_id": order.id,
            "payment_status": order.payment_status,
        }

    payment = (
        db.query(Payment)
        .filter(
            Payment.order_id == order.id,
            Payment.gateway_order_id == data.razorpay_order_id,
        )
        .with_for_update()
        .first()
    )

    if not payment:
        raise HTTPException(
            status_code=404,
            detail="Payment record not found",
        )

    try:
        # Verify the signature received from Razorpay Checkout.
        client.utility.verify_payment_signature(
            {
                "razorpay_order_id": data.razorpay_order_id,
                "razorpay_payment_id": data.razorpay_payment_id,
                "razorpay_signature": data.razorpay_signature,
            }
        )

        # Confirm payment details with Razorpay.
        gateway_payment = client.payment.fetch(data.razorpay_payment_id)

        if gateway_payment.get("order_id") != payment.gateway_order_id:
            raise HTTPException(
                status_code=400,
                detail="Payment does not match this order",
            )

        expected_paise = int(Decimal(str(payment.amount)) * 100)
        if int(gateway_payment.get("amount", -1)) != expected_paise:
            raise HTTPException(
                status_code=400,
                detail="Payment amount does not match",
            )

        if gateway_payment.get("currency") != payment.currency:
            raise HTTPException(
                status_code=400,
                detail="Payment currency does not match",
            )

        if gateway_payment.get("status") != "captured":
            raise HTTPException(
                status_code=400,
                detail="Payment has not been captured yet",
            )

        # Lock and validate all products before reducing stock.
        order_items = (
            db.query(OrderItem)
            .filter(OrderItem.order_id == order.id)
            .all()
        )
        locked_products = {}

        for item in order_items:
            product = (
                db.query(Product)
                .filter(Product.id == item.product_id)
                .with_for_update()
                .first()
            )

            if not product or not product.is_active:
                raise HTTPException(
                    status_code=400,
                    detail=f"Product {item.product_name} is unavailable",
                )

            if product.stock < item.quantity:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient stock for {item.product_name}",
                )

            locked_products[item.product_id] = product

        # Payment is captured, so confirm the order and reduce stock.
        for item in order_items:
            locked_products[item.product_id].stock -= item.quantity

        product_ids = [item.product_id for item in order_items]
        if product_ids:
            (
                db.query(CartItem)
                .filter(
                    CartItem.user_id == current_user.id,
                    CartItem.product_id.in_(product_ids),
                )
                .delete(synchronize_session=False)
            )

        payment.gateway_payment_id = data.razorpay_payment_id
        payment.status = "CAPTURED"
        order.payment_status = "PAID"
        order.status = "PLACED"

        db.commit()
        db.refresh(order)

        return {
            "message": "Payment verified and order confirmed",
            "order_id": order.id,
            "payment_status": order.payment_status,
            "status": order.status,
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception as error:
        db.rollback()
        logger.exception(
            "Payment verification failed for order_id=%s",
            data.order_id,
        )
        raise HTTPException(
            status_code=400,
            detail="Payment verification failed. Check the FastAPI terminal for details.",
        ) from error


@router.get("/my-orders")
def get_my_orders(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    orders = (
        db.query(Order)
        .filter(Order.user_id == current_user.id)
        .order_by(Order.id.desc())
        .all()
    )

    return [
        {
            "order_id": order.id,
            "status": order.status,
            "payment_method": order.payment_method,
            "payment_status": order.payment_status,
            "total_amount": str(order.total_amount),
            "created_at": order.created_at,
            "items": [
                {
                    "product_name": item.product_name,
                    "unit_price": str(item.unit_price),
                    "quantity": item.quantity,
                    "subtotal": str(item.subtotal),
                }
                for item in order.items
            ],
        }
        for order in orders
    ]

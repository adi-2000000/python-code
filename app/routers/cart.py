
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import CartItem, Product, User
from app.routers.users import get_current_user


router = APIRouter(prefix="/api/cart", tags=["Cart"])


# Request model: Add product to cart
class CartAddRequest(BaseModel):
    product_id: int = Field(gt=0)
    quantity: int = Field(default=1, ge=1, le=100)


# Request model: Update cart quantity
class CartUpdateRequest(BaseModel):
    quantity: int = Field(ge=1, le=100)


# 1. Add product to cart
@router.post("/items", status_code=status.HTTP_201_CREATED)
def add_to_cart(
    data: CartAddRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    product = (
        db.query(Product)
        .filter(
            Product.id == data.product_id,
            Product.is_active.is_(True),
        )
        .first()
    )

    if not product:
        raise HTTPException(
            status_code=404,
            detail="Product not found or inactive",
        )

    if product.stock < data.quantity:
        raise HTTPException(
            status_code=400,
            detail="Not enough stock available",
        )

    item = (
        db.query(CartItem)
        .filter(
            CartItem.user_id == current_user.id,
            CartItem.product_id == product.id,
        )
        .first()
    )

    if item:
        new_quantity = item.quantity + data.quantity

        if new_quantity > product.stock:
            raise HTTPException(
                status_code=400,
                detail="Requested quantity exceeds available stock",
            )

        item.quantity = new_quantity
    else:
        item = CartItem(
            user_id=current_user.id,
            product_id=product.id,
            quantity=data.quantity,
        )
        db.add(item)

    db.commit()
    db.refresh(item)

    return {
        "message": "Product added to cart",
        "cart_item_id": item.id,
        "product_id": product.id,
        "product_name": product.name,
        "quantity": item.quantity,
        "unit_price": product.price,
        "subtotal": product.price * item.quantity,
    }


# 2. Get current user's cart
@router.get("/")
def get_cart(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items = (
        db.query(CartItem)
        .filter(CartItem.user_id == current_user.id)
        .all()
    )

    cart_items = []
    total = Decimal("0.00")

    for item in items:
        product = item.product

        if not product:
            continue

        subtotal = product.price * item.quantity
        total += subtotal

        cart_items.append({
            "cart_item_id": item.id,
            "product_id": product.id,
            "name": product.name,
            "price": product.price,
            "quantity": item.quantity,
            "subtotal": subtotal,
            "image_url": product.image_url,
        })

    return {
        "items": cart_items,
        "total_items": sum(
            item["quantity"] for item in cart_items
        ),
        "total_price": total,
    }


# 3. Update cart quantity
@router.patch("/items/{cart_item_id}")
def update_cart_item(
    cart_item_id: int,
    data: CartUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = (
        db.query(CartItem)
        .filter(
            CartItem.id == cart_item_id,
            CartItem.user_id == current_user.id,
        )
        .first()
    )

    if not item:
        raise HTTPException(
            status_code=404,
            detail="Cart item not found",
        )

    product = item.product

    if not product or not product.is_active:
        raise HTTPException(
            status_code=404,
            detail="Product is unavailable",
        )

    if data.quantity > product.stock:
        raise HTTPException(
            status_code=400,
            detail="Not enough stock available",
        )

    item.quantity = data.quantity

    db.commit()
    db.refresh(item)

    return {
        "message": "Cart quantity updated",
        "cart_item_id": item.id,
        "quantity": item.quantity,
        "subtotal": product.price * item.quantity,
    }


# 4. Remove an item from cart
@router.delete("/items/{cart_item_id}")
def remove_cart_item(
    cart_item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = (
        db.query(CartItem)
        .filter(
            CartItem.id == cart_item_id,
            CartItem.user_id == current_user.id,
        )
        .first()
    )

    if not item:
        raise HTTPException(
            status_code=404,
            detail="Cart item not found",
        )

    db.delete(item)
    db.commit()

    return {"message": "Product removed from cart"}

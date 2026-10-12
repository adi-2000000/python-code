
from decimal import Decimal
from typing import Optional
from fastapi import Query
from app.ml.recommendation import get_recommendations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Product

router = APIRouter(
    prefix="/api/products",
    tags=["Products"],
)


class ProductCreate(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    description: Optional[str] = None
    price: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    stock: int = Field(default=0, ge=0)
    image_url: Optional[str] = None


class ProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str]
    price: Decimal
    stock: int
    image_url: Optional[str]
    is_active: bool


@router.get("/", response_model=list[ProductResponse])
def get_products(db: Session = Depends(get_db)):
    return (
        db.query(Product)
        .filter(Product.is_active.is_(True))
        .order_by(Product.id.desc())
        .all()
    )

@router.get("/{product_id}/recommendations", response_model=list[ProductResponse])
def product_recommendations(
    product_id: int,
    limit: int = Query(default=4, ge=1, le=10),
    db: Session = Depends(get_db),
):
    products = (
        db.query(Product)
        .filter(Product.is_active.is_(True))
        .all()
    )

    selected_product = next(
        (product for product in products if product.id == product_id),
        None,
    )

    if selected_product is None:
        raise HTTPException(
            status_code=404,
            detail="Product not found",
        )

    recommendations = get_recommendations(
        products=products,
        product_id=product_id,
        limit=limit,
    )

    return recommendations


@router.get("/{product_id}", response_model=ProductResponse)
def get_product(product_id: int, db: Session = Depends(get_db)):
    product = db.query(Product).filter(
        Product.id == product_id,
        Product.is_active.is_(True),
    ).first()

    

    if product is None:
        raise HTTPException(
            status_code=404,
            detail="Product not found",
        )

    return product


@router.post("/", response_model=ProductResponse, status_code=201)
def create_product(
    product_data: ProductCreate,
    db: Session = Depends(get_db),
):
    product = Product(**product_data.model_dump())

    db.add(product)
    db.commit()
    db.refresh(product)

    return product


from pathlib import Path

from fastapi import FastAPI, Request, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
from sqlalchemy import text

from app import models
from app.database import Base, engine, get_db
from app.routers import products, users, cart, orders

from fastapi import Request
from fastapi.responses import RedirectResponse


templates = Jinja2Templates(directory="templates")




app = FastAPI(
    title="My E-commerce Website",
    version="1.0.0",
)

BASE_DIR = Path(__file__).resolve().parent.parent


# Static files
app.mount(
    "/static",
    StaticFiles(directory=str(BASE_DIR / "static")),
    name="static",
)


# HTML templates
templates = Jinja2Templates(
    directory=str(BASE_DIR / "templates")
)


# Create database tables
Base.metadata.create_all(bind=engine)


# Register API routers
app.include_router(products.router)
app.include_router(users.router)
app.include_router(cart.router)
app.include_router(orders.router)


# Homepage
@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={"title": "My E-commerce Website"},
    )


# Cart page
@app.get("/cart", response_class=HTMLResponse)
def cart_page(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="cart.html",
        context={"title": "Shopping Cart"},
    )


# Register page
@app.get("/register", response_class=HTMLResponse)
def register_page(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="register.html",
        context={"title": "Register"},
    )


# Login page
@app.get("/login", response_class=HTMLResponse)
def login_page(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="login.html",
        context={"title": "Login"},
    )


# Checkout page
@app.get("/checkout", response_class=HTMLResponse)
def checkout_page(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="checkout.html",
        context={"title": "Checkout"},
    )


# API health check
@app.get("/api/health")
def health_check():
    return {
        "status": "success",
        "message": "FastAPI is working correctly",
    }


# Database health check
@app.get("/api/health/db")
def database_health(db=Depends(get_db)):
    db.execute(text("SELECT 1"))

    return {
        "status": "success",
        "message": "MySQL connected successfully",
    }


@app.get("/my-orders", response_class=HTMLResponse)
def my_orders_page(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="my_orders.html",
        context={"title": "My Orders"}
    )

    
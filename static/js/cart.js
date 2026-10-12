
const cartItemsElement = document.getElementById("cartItems");
const cartMessage = document.getElementById("cartMessage");
const cartSummary = document.getElementById("cartSummary");
const cartSubtotal = document.getElementById("cartSubtotal");
const clearCartButton = document.getElementById("clearCart");
const checkoutButton = document.getElementById("checkoutButton");

document.addEventListener("DOMContentLoaded", () => {
    if (clearCartButton) {
        clearCartButton.addEventListener("click", clearCart);
    }

    if (checkoutButton) {
        checkoutButton.addEventListener("click", () => {
            window.location.href = "/checkout";
        });
    }

    loadCart();
});

function getToken() {
    return localStorage.getItem("access_token");
}

async function loadCart() {
    const token = getToken();

    if (!token) {
        window.location.href = "/login";
        return;
    }

    try {
        const response = await fetch("/api/cart/", {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        if (response.status === 401) {
            localStorage.removeItem("access_token");
            window.location.href = "/login";
            return;
        }

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || "Unable to load cart");
        }

        renderCart(data);
    } catch (error) {
        console.error("Load cart error:", error);

        if (cartMessage) {
            cartMessage.textContent =
                error.message || "Unable to load your cart.";
        }
    }
}

function renderCart(cartData) {
    if (!cartItemsElement) return;

    cartItemsElement.replaceChildren();

    const items = cartData.items || [];

    if (items.length === 0) {
        cartMessage.textContent = "Your cart is empty.";
        cartSummary.hidden = true;
        updateHeaderCartCount(0);
        return;
    }

    cartMessage.textContent = `${items.length} product type(s) in your cart.`;
    cartSummary.hidden = false;

    items.forEach((item) => {
        const row = document.createElement("article");
        row.className = "cart-item";

        const details = document.createElement("div");

        const name = document.createElement("h3");
        name.textContent = item.name;

        const price = document.createElement("p");
        price.textContent = `Price: ₹${Number(item.price).toFixed(2)}`;

        const quantity = document.createElement("p");
        quantity.textContent = `Quantity: ${item.quantity}`;

        const lineTotal = document.createElement("p");
        lineTotal.textContent =
            `Total: ₹${Number(item.subtotal).toFixed(2)}`;

        const controls = document.createElement("div");
        controls.className = "cart-controls";

        const decrease = document.createElement("button");
        decrease.textContent = "−";
        decrease.setAttribute("aria-label", `Decrease ${item.name}`);
        decrease.disabled = item.quantity <= 1;
        decrease.addEventListener("click", () => {
            updateQuantity(item.cart_item_id, item.quantity - 1);
        });

        const increase = document.createElement("button");
        increase.textContent = "+";
        increase.setAttribute("aria-label", `Increase ${item.name}`);
        increase.addEventListener("click", () => {
            updateQuantity(item.cart_item_id, item.quantity + 1);
        });

        const remove = document.createElement("button");
        remove.textContent = "Remove";
        remove.className = "remove-button";
        remove.addEventListener("click", () => {
            removeItem(item.cart_item_id);
        });

        controls.append(decrease, increase, remove);
        details.append(name, price, quantity, lineTotal, controls);
        row.append(details);
        cartItemsElement.append(row);
    });

    if (cartSubtotal) {
        cartSubtotal.textContent =
            `₹${Number(cartData.total_price || 0).toFixed(2)}`;
    }

    updateHeaderCartCount(cartData.total_items || 0);
}

async function updateQuantity(cartItemId, quantity) {
    if (quantity < 1) return;

    await sendCartRequest(
        `/api/cart/items/${cartItemId}`,
        "PATCH",
        { quantity }
    );
}

async function removeItem(cartItemId) {
    if (!confirm("Remove this product from your cart?")) {
        return;
    }

    await sendCartRequest(
        `/api/cart/items/${cartItemId}`,
        "DELETE"
    );
}

async function clearCart() {
    if (!confirm("Remove all products from your cart?")) {
        return;
    }

    try {
        const response = await fetch("/api/cart/", {
            headers: {
                "Authorization": `Bearer ${getToken()}`
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || "Unable to load cart");
        }

        for (const item of (data.items || [])) {
            const deleteResponse = await fetch(
                `/api/cart/items/${item.cart_item_id}`,
                {
                    method: "DELETE",
                    headers: {
                        "Authorization": `Bearer ${getToken()}`
                    }
                }
            );

            if (!deleteResponse.ok) {
                throw new Error("Unable to remove all cart items");
            }
        }

        await loadCart();
    } catch (error) {
        console.error("Clear cart error:", error);
        alert(error.message || "Unable to clear cart.");
        await loadCart();
    }
}

async function sendCartRequest(url, method, body = null) {
    const token = getToken();

    if (!token) {
        window.location.href = "/login";
        return;
    }

    try {
        const options = {
            method,
            headers: {
                "Authorization": `Bearer ${token}`
            }
        };

        if (body) {
            options.headers["Content-Type"] = "application/json";
            options.body = JSON.stringify(body);
        }

        const response = await fetch(url, options);

        if (response.status === 401) {
            localStorage.removeItem("access_token");
            window.location.href = "/login";
            return;
        }

        const result = response.status === 204
            ? {}
            : await response.json();

        if (!response.ok) {
            throw new Error(result.detail || "Cart update failed");
        }

        await loadCart();
    } catch (error) {
        console.error("Cart request error:", error);
        alert(error.message || "Unable to update cart.");
    }
}

function updateHeaderCartCount(count) {
    const countElement = document.getElementById("cartCount");

    if (countElement) {
        countElement.textContent = String(count);
    }
}

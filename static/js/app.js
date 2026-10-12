
const API_BASE = "";

let allProducts = [];

document.addEventListener("DOMContentLoaded", () => {
    loadProducts();
    updateCartCount();

    const searchInput = document.getElementById("searchInput");

    if (searchInput) {
        searchInput.addEventListener("input", filterProducts);
    }

    const cartButton = document.getElementById("cartButton");

    if (cartButton) {
        cartButton.addEventListener("click", () => {
            window.location.href = "/cart";
        });
    }
});

async function loadProducts() {
    const statusMessage = document.getElementById("statusMessage");

    try {
        if (statusMessage) {
            statusMessage.textContent = "Loading products...";
        }

        const response = await fetch(`${API_BASE}/api/products/`);

        if (!response.ok) {
            throw new Error("Unable to load products");
        }

        allProducts = await response.json();

        renderProducts(allProducts, "productList");

        if (statusMessage) {
            statusMessage.textContent = allProducts.length
                ? `${allProducts.length} products available`
                : "No products available yet.";
        }

        await loadRecommendations();
    } catch (error) {
        console.error("Products error:", error);

        if (statusMessage) {
            statusMessage.textContent =
                "Could not load products. Please check the API.";
        }
    }
}

function renderProducts(items, containerId) {
    const productList = document.getElementById(containerId);

    if (!productList) return;

    productList.replaceChildren();

    items.forEach((product) => {
        const card = document.createElement("article");
        card.className = "product-card";

        const image = document.createElement("img");
        image.className = "product-image";
        image.alt = product.name || "Product image";
        image.loading = "lazy";

        if (product.image_url) {
            image.src = product.image_url;
            image.onerror = () => {
                image.style.display = "none";
            };
        } else {
            image.style.display = "none";
        }

        const name = document.createElement("h3");
        name.textContent = product.name || "Unnamed product";

        const description = document.createElement("p");
        description.className = "product-description";
        description.textContent =
            product.description || "No description available.";

        const price = document.createElement("p");
        price.className = "price";
        price.textContent =
            `₹${Number(product.price || 0).toFixed(2)}`;

        const stock = document.createElement("p");
        stock.className = "product-stock";
        stock.textContent = Number(product.stock) > 0
            ? `In stock: ${product.stock}`
            : "Out of stock";

        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.className = "add-button";
        addButton.textContent = "Add to Cart";
        addButton.disabled = Number(product.stock) <= 0;

        addButton.addEventListener("click", async () => {
            await addToCart(product.id, addButton);
        });

        card.append(
            image,
            name,
            description,
            price,
            stock,
            addButton
        );

        productList.appendChild(card);
    });
}

async function loadRecommendations() {
    const container = document.getElementById("recommendedProductList");
    const status = document.getElementById("recommendationStatus");

    if (!container || !status) return;

    container.replaceChildren();

    if (allProducts.length < 2) {
        status.textContent =
            "Add more products to see recommendations.";
        return;
    }

    // Use the newest active product as the recommendation reference.
    const featuredProduct = allProducts[0];

    status.textContent =
        `Finding products related to ${featuredProduct.name}...`;

    try {
        const response = await fetch(
            `${API_BASE}/api/products/${featuredProduct.id}/recommendations?limit=4`
        );

        if (!response.ok) {
            throw new Error("Unable to load recommendations");
        }

        const recommendations = await response.json();

        // Avoid showing duplicate products with the same name.
        const seenNames = new Set([
            featuredProduct.name.trim().toLowerCase()
        ]);

        const uniqueRecommendations = recommendations.filter((product) => {
            const name = (product.name || "").trim().toLowerCase();

            if (!name || seenNames.has(name)) {
                return false;
            }

            seenNames.add(name);
            return true;
        });

        if (uniqueRecommendations.length === 0) {
            status.textContent =
                "No similar products found yet. Add products with related descriptions.";
            return;
        }

        renderProducts(
            uniqueRecommendations,
            "recommendedProductList"
        );

        status.textContent =
            `Recommended based on ${featuredProduct.name}`;
    } catch (error) {
        console.error("Recommendation error:", error);

        status.textContent =
            "Recommendations could not be loaded. Please try again.";
    }
}

function filterProducts() {
    const searchInput = document.getElementById("searchInput");
    const searchTerm = searchInput.value.trim().toLowerCase();

    const filteredProducts = allProducts.filter((product) => {
        const name = (product.name || "").toLowerCase();
        const description = (product.description || "").toLowerCase();

        return name.includes(searchTerm) ||
            description.includes(searchTerm);
    });

    renderProducts(filteredProducts, "productList");

    const statusMessage = document.getElementById("statusMessage");

    if (statusMessage) {
        statusMessage.textContent =
            `${filteredProducts.length} product(s) found.`;
    }
}

async function addToCart(productId, button) {
    const token = localStorage.getItem("access_token");

    if (!token) {
        alert("Please login before adding products to your cart.");
        window.location.href = "/login";
        return;
    }

    const originalText = button.textContent;

    button.disabled = true;
    button.textContent = "Adding...";

    try {
        const response = await fetch(`${API_BASE}/api/cart/items`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                product_id: productId,
                quantity: 1
            })
        });

        const result = await response.json();

        if (response.status === 401) {
            localStorage.removeItem("access_token");
            alert("Your login session has expired. Please login again.");
            window.location.href = "/login";
            return;
        }

        if (!response.ok) {
            throw new Error(result.detail || "Could not add product to cart");
        }

        button.textContent = "Added!";
        await updateCartCount();

        setTimeout(() => {
            button.textContent = originalText;
        }, 1200);
    } catch (error) {
        console.error("Add to cart error:", error);
        alert(error.message || "Something went wrong.");
        button.textContent = originalText;
    } finally {
        button.disabled = false;
    }
}

async function updateCartCount() {
    const cartCount = document.getElementById("cartCount");

    if (!cartCount) return;

    const token = localStorage.getItem("access_token");

    if (!token) {
        cartCount.textContent = "0";
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/cart/`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        if (response.status === 401) {
            localStorage.removeItem("access_token");
            cartCount.textContent = "0";
            return;
        }

        if (!response.ok) {
            throw new Error("Unable to fetch cart");
        }

        const cartData = await response.json();

        cartCount.textContent = String(cartData.total_items || 0);
    } catch (error) {
        console.error("Cart count error:", error);
    }
}

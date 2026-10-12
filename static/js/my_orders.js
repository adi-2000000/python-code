 
async function loadOrders() {
    const message = document.getElementById("message");
    const container = document.getElementById("orders-container");
    const token = localStorage.getItem("access_token");

    if (!token) {
        message.textContent = "Please login to view your orders.";
        return;
    }

    try {
        const response = await fetch("/api/orders/my-orders", {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        if (response.status === 401) {
            message.textContent = "Your login session has expired. Please login again.";
            return;
        }

        if (!response.ok) {
            throw new Error("Unable to load orders.");
        }

        const orders = await response.json();
        message.textContent = "";

        if (orders.length === 0) {
            message.textContent = "You have not placed any orders yet.";
            return;
        }

        orders.forEach(order => {
            const card = document.createElement("section");
            card.className = "order-card";

            const heading = document.createElement("h3");
            heading.textContent = `Order #${order.order_id}`;

            const status = document.createElement("p");
            status.textContent = `Status: ${order.status}`;

            const payment = document.createElement("p");
            payment.textContent = `Payment: ${order.payment_method}`;

            const total = document.createElement("p");
            total.textContent = `Total: ₹${order.total_amount}`;

            const itemsHeading = document.createElement("h4");
            itemsHeading.textContent = "Products";

            const list = document.createElement("ul");

            order.items.forEach(item => {
                const li = document.createElement("li");
                li.textContent =
                    `${item.product_name} — ₹${item.unit_price} × ${item.quantity} = ₹${item.subtotal}`;
                list.appendChild(li);
            });

            card.append(heading, status, payment, total, itemsHeading, list);
            container.appendChild(card);
        });
    } catch (error) {
        message.textContent = error.message;
    }
}

loadOrders();

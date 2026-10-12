
document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("checkoutForm");

    if (form) {
        form.addEventListener("submit", placeOrder);
    } else {
        console.error("Checkout form not found.");
    }
});

async function readResponse(response) {
    const text = await response.text();

    if (!text) return {};

    try {
        return JSON.parse(text);
    } catch {
        return { detail: text };
    }
}

function getErrorMessage(result, fallback) {
    if (typeof result?.detail === "string") {
        return result.detail;
    }

    if (Array.isArray(result?.detail)) {
        return result.detail
            .map(item => item.msg || JSON.stringify(item))
            .join(", ");
    }

    return fallback;
}

async function placeOrder(event) {
    event.preventDefault();

    const form = document.getElementById("checkoutForm");
    const message = document.getElementById("checkoutMessage");
    const button = document.getElementById("placeOrderButton");

    if (!form || !message || !button) {
        console.error("Checkout HTML elements are missing.");
        return;
    }

    const token = localStorage.getItem("access_token");

    if (!token) {
        window.location.href = "/login";
        return;
    }

    if (!form.reportValidity()) return;

    const paymentMethod =
        document.getElementById("payment_method")?.value || "COD";

    const payload = {
        full_name: document.getElementById("full_name").value.trim(),
        phone: document.getElementById("phone").value.trim(),
        address: document.getElementById("address").value.trim(),
        city: document.getElementById("city").value.trim(),
        state: document.getElementById("state").value.trim(),
        postal_code: document.getElementById("postal_code").value.trim()
    };

    button.disabled = true;
    button.textContent = "Processing...";
    message.textContent = "";

    try {
        if (paymentMethod === "COD") {
            await placeCODOrder(payload, token, message, button);
        } else if (paymentMethod === "RAZORPAY") {
            await startOnlinePayment(payload, token, message, button);
        } else {
            throw new Error("Please select a valid payment method.");
        }
    } catch (error) {
        console.error("Checkout error:", error);
        message.textContent = error.message || "Something went wrong.";
        button.disabled = false;
        button.textContent = "Place Order";
    }
}

async function apiRequest(url, token, body) {
    let response;

    try {
        response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify(body)
        });
    } catch (error) {
        console.error("Network error:", error);
        throw new Error(
            "Cannot connect to the server. Check that FastAPI is running."
        );
    }

    const result = await readResponse(response);

    console.log("API URL:", url);
    console.log("HTTP status:", response.status);
    console.log("API response:", result);

    if (response.status === 401) {
        localStorage.removeItem("access_token");
        window.location.href = "/login";
        throw new Error("Session expired. Please log in again.");
    }

    if (!response.ok) {
        throw new Error(
            getErrorMessage(
                result,
                `Request failed with status ${response.status}.`
            )
        );
    }

    return result;
}

async function placeCODOrder(payload, token, message, button) {
    const result = await apiRequest(
        "/api/orders/checkout",
        token,
        {
            ...payload,
            payment_method: "COD"
        }
    );

    message.textContent =
        `Order #${result.order_id} placed successfully! ` +
        `Total: ₹${Number(result.total_amount).toFixed(2)}. ` +
        "Payment: Cash on Delivery.";

    document.getElementById("checkoutForm").reset();
    button.textContent = "Order Placed";
}

async function startOnlinePayment(payload, token, message, button) {
    if (typeof window.Razorpay !== "function") {
        throw new Error(
            "Razorpay is not loaded. Check checkout.html and refresh the page."
        );
    }

    const result = await apiRequest(
        "/api/orders/online/create",
        token,
        payload
    );

    if (
        !result.razorpay_key_id ||
        !result.razorpay_order_id ||
        result.amount == null ||
        result.order_id == null
    ) {
        console.error("Missing Razorpay details:", result);
        throw new Error(
            "Razorpay order details are missing from the server response."
        );
    }

    const options = {
        key: result.razorpay_key_id,
        amount: result.amount,
        currency: result.currency || "INR",
        name: "ShopEasy",
        description: `Order #${result.order_id}`,
        order_id: result.razorpay_order_id,

        prefill: {
            name: result.name || payload.full_name,
            email: result.email || "",
            contact: result.phone || payload.phone
        },

        theme: {
            color: "#2563eb"
        },

        handler: async function (paymentResponse) {
            message.textContent = "Verifying payment...";

            try {
                const verified = await apiRequest(
                    "/api/orders/online/verify",
                    token,
                    {
                        order_id: result.order_id,
                        razorpay_order_id:
                            paymentResponse.razorpay_order_id,
                        razorpay_payment_id:
                            paymentResponse.razorpay_payment_id,
                        razorpay_signature:
                            paymentResponse.razorpay_signature
                    }
                );

                message.textContent =
                    `Payment successful! Order #${verified.order_id} confirmed.`;

                document.getElementById("checkoutForm").reset();
                button.textContent = "Order Placed";

            } catch (error) {
                console.error("Payment verification error:", error);
                message.textContent =
                    error.message || "Payment verification failed.";
                button.textContent = "Place Order";
            } finally {
                button.disabled = false;
            }
        },

        modal: {
            ondismiss: function () {
                message.textContent =
                    "Payment window closed. Order confirmation is pending.";

                button.disabled = false;
                button.textContent = "Place Order";
            }
        }
    };

    const razorpay = new window.Razorpay(options);

    razorpay.on("payment.failed", function (paymentError) {
        console.error("Razorpay payment failed:", paymentError);

        message.textContent =
            "Payment failed: " +
            (paymentError.error?.description || "Please try again.");

        button.disabled = false;
        button.textContent = "Place Order";
    });

    razorpay.open();
}

const API_URL = "/api/users";

// REGISTER
const registerForm = document.getElementById("registerForm");

if (registerForm) {
    registerForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const message = document.getElementById("registerMessage");

        const userData = {
            name: document.getElementById("name").value.trim(),
            email: document.getElementById("email").value.trim(),
            password: document.getElementById("password").value
        };

        message.textContent = "Registering...";

        try {
            const response = await fetch(`${API_URL}/register`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(userData)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.detail || "Registration failed."
                );
            }

            message.textContent =
                "Registration successful! Please login.";

            registerForm.reset();

            setTimeout(function () {
                window.location.href = "/login";
            }, 1200);

        } catch (error) {
            message.textContent = error.message;
        }
    });
}


// LOGIN
const loginForm = document.getElementById("loginForm");

if (loginForm) {
    loginForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const message = document.getElementById("loginMessage");

        const loginData = {
            email: document.getElementById("email").value.trim(),
            password: document.getElementById("password").value
        };

        message.textContent = "Logging in...";

        try {
            const response = await fetch(`${API_URL}/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(loginData)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || "Login failed.");
            }

            if (!data.access_token) {
                throw new Error("Access token was not received.");
            }

            localStorage.setItem("access_token", data.access_token);

            message.textContent = "Login successful!";

            loginForm.reset();

            setTimeout(function () {
                window.location.href = "/";
            }, 1000);

        } catch (error) {
            message.textContent = error.message;
        }
    });
}


// CHECK LOGGED-IN USER
async function loadCurrentUser() {
    const token = localStorage.getItem("access_token");

    const userElement = document.getElementById("userInfo");
    const loginLink = document.getElementById("loginLink");
    const registerLink = document.getElementById("registerLink");
    const logoutButton = document.getElementById("logoutButton");

    if (!token) {
        if (userElement) userElement.textContent = "Welcome, Guest";
        if (loginLink) loginLink.style.display = "inline-block";
        if (registerLink) registerLink.style.display = "inline-block";
        if (logoutButton) logoutButton.style.display = "none";
        return;
    }

    try {
        const response = await fetch("/api/users/me", {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        if (!response.ok) {
            localStorage.removeItem("access_token");

            if (userElement) userElement.textContent = "Welcome, Guest";
            if (loginLink) loginLink.style.display = "inline-block";
            if (registerLink) registerLink.style.display = "inline-block";
            if (logoutButton) logoutButton.style.display = "none";
            return;
        }

        const user = await response.json();

        if (userElement) {
            userElement.textContent = `Welcome, ${user.name}`;
        }

        if (loginLink) loginLink.style.display = "none";
        if (registerLink) registerLink.style.display = "none";
        if (logoutButton) logoutButton.style.display = "inline-block";

    } catch (error) {
        console.error("User profile error:", error);
    }
}

function logoutUser() {
    localStorage.removeItem("access_token");
    window.location.href = "/";
}

document.addEventListener("DOMContentLoaded", loadCurrentUser);

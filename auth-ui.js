const authContent = document.getElementById("authContent");

const accountProfileHTML = (user) => `
<div class="account-profile">
  <div class="profile-avatar">${user.name.charAt(0)}</div>
  <div class="profile-info">
    <strong>${user.name}</strong>
    <span>${user.email}</span>
  </div>
</div>
<ul class="account-menu">
  <li>Settings</li>
  <li>Personalization</li>
  <li>Help</li>
  <li id="logoutBtn" class="danger">Log out</li>
</ul>
`;

const loginHTML = `

  <h2>Sign in to Newszoid</h2>
  <button class="auth-btn" id="googleLogin">Continue with Google</button>

  <div class="divider">or</div>

  <div class="input-row">
    <input type="email" id="loginEmail" placeholder="Email">
    <input type="password" id="loginPassword" placeholder="Password">
  </div>
  <button class="auth-btn" id="loginBtn">Login</button>

  <p>Don’t have an account?
    <a id="showRegister">Create one</a>
  </p>
`;

const registerHTML = `
  <h2>Create account</h2>
  <input id="regName" placeholder="Full name">
  <input id="regEmail" placeholder="Email">
  <input type="password" id="regPassword" placeholder="Password">
  <input type="password" id="regConfirm" placeholder="Confirm password">
  <button class="auth-btn" id="registerBtn">Register</button>

  <p>Already have an account?
    <a id="showLogin">Sign in</a>
  </p>
`;

function renderLogin() {
    authContent.innerHTML = loginHTML;
    bindLoginEvents();
}

function renderRegister() {
    authContent.innerHTML = registerHTML;
    bindRegisterEvents();
}

function renderProfile(user) {
    authContent.innerHTML = accountProfileHTML(user);
    bindProfileEvents();
}

function bindProfileEvents() {
    document.getElementById("logoutBtn")?.addEventListener("click", handleLogout);
}

function handleLogout() {
    localStorage.removeItem("newszoid_loggedInUser");
    localStorage.removeItem("newszoid_user");
    location.reload();
}

function bindLoginEvents() {
    document.getElementById("showRegister")?.addEventListener("click", renderRegister);

    document.getElementById("googleLogin")?.addEventListener("click", () => {
        // Initialize Google Sign-In
        google.accounts.id.initialize({
            client_id: "784964956191-2pgl6o4r6v6m4o4v6m4o4v6m4o4v6m4.apps.googleusercontent.com", // Placeholder: User needs to replace this
            callback: handleGoogleLogin
        });
        google.accounts.id.prompt();
    });

    document.getElementById("loginBtn")?.addEventListener("click", () => {
        const email = document.getElementById("loginEmail").value;
        const password = document.getElementById("loginPassword").value;
        // Basic simulation for now
        if (email && password) {
            const user = { name: email.split('@')[0], email: email };
            localStorage.setItem("newszoid_loggedInUser", JSON.stringify(user));
            location.reload();
        }
    });
}

function bindRegisterEvents() {
    document.getElementById("showLogin")?.addEventListener("click", renderLogin);

    document.getElementById("registerBtn")?.addEventListener("click", () => {
        const name = document.getElementById("regName").value;
        const email = document.getElementById("regEmail").value;
        const password = document.getElementById("regPassword").value;
        if (name && email && password) {
            const user = { name, email };
            localStorage.setItem("newszoid_loggedInUser", JSON.stringify(user));
            location.reload();
        }
    });
}

function handleGoogleLogin(response) {
    console.log("Google Login Response:", response);
    // Send token to backend
    fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: response.credential })
    })
        .then(res => res.json())
        .then(data => {
            if (data.ok && data.user) {
                localStorage.setItem("newszoid_loggedInUser", JSON.stringify(data.user));
                location.reload();
            } else {
                console.error("Login failed:", data.error);
            }
        })
        .catch(err => console.error("Error:", err));
}

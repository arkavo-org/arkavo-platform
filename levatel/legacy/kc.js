// kc.js
document.addEventListener('DOMContentLoaded', function () {
    if (typeof Keycloak !== 'undefined') {
        const keycloak = new Keycloak({
            url: "https://keycloak.app.codecollective.us/auth",
            realm: "opentdf",
            clientId: "web-client"
        });

        window.keycloak = keycloak;

        function updateAuthUI(authenticated) {
            const loginButton = document.getElementById('loginButton');
            const logoutButton = document.getElementById('logoutButton');
            const accountButton = document.getElementById('accountButton');
            const userInfo = document.getElementById('userInfo');
            const micButton = document.getElementById('micButton');
            const status = document.getElementById('status');
            const vadStatus = document.getElementById('vadStatus');

            if (authenticated) {
                loginButton.classList.add('hidden');
                logoutButton.classList.remove('hidden');
                accountButton.classList.remove('hidden');
                micButton.disabled = false;
                status.textContent = 'Click the microphone to start';
                vadStatus.textContent = 'Voice Activity Detection Ready';

                if (keycloak.tokenParsed) {
                    userInfo.textContent = `Logged in as ${keycloak.tokenParsed.preferred_username || keycloak.tokenParsed.email || 'User'}`;
                } else {
                    userInfo.textContent = 'Logged in';
                }
            } else {
                loginButton.classList.remove('hidden');
                logoutButton.classList.add('hidden');
                accountButton.classList.add('hidden');
                micButton.disabled = true;
                userInfo.textContent = 'Not logged in';
                status.textContent = 'Please login to start recording';
                vadStatus.textContent = 'Login to enable Voice Activity Detection';
            }
        }

        function initKeycloak() {
            keycloak.init({ onLoad: 'check-sso' })
                .then(authenticated => {
                    updateAuthUI(authenticated);

                    // Expose auth state change to other modules
                    if (authenticated && typeof window.onAuthSuccess === 'function') {
                        window.onAuthSuccess(keycloak.token);
                    }
                })
                .catch(err => {
                    console.error("Keycloak init error", err);
                    document.getElementById("error").textContent = "Authentication failed. Please try again.";
                });
        }

        // Event Listeners
        document.getElementById('logoutButton').addEventListener('click', () => keycloak.logout());
        document.getElementById('accountButton').addEventListener('click', () => keycloak.accountManagement());
        document.getElementById('loginButton').addEventListener('click', () => keycloak.login());

        initKeycloak();
    } else {
        console.error('Keycloak not available');
        document.getElementById("error").textContent = "Authentication service unavailable.";
    }
});

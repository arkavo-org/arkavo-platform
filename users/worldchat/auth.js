// Initialize Keycloak
const keycloak = new Keycloak({
  url: 'https://keycloak.app.codecollective.us/auth',
  realm: 'opentdf',
  clientId: 'web-client'
});

// Initialize authentication
function initAuth() {
  keycloak.init({
    onLoad: 'check-sso',
    pkceMethod: 'S256',
    enableLogging: true
  }).then(authenticated => {
    console.log('Keycloak init done. Authenticated:', authenticated);
    updateUI(authenticated);
  }).catch(err => {
    console.error('Keycloak init failed:', err);
  });

}

// Update UI based on auth state
function updateUI(authenticated) {
  const loginBtn = document.getElementById('login-btn');
  const loginContainer = document.getElementById('login-container');
  const chatContainer = document.getElementById('chat-container');

  if (authenticated) {
    // User is logged in - show profile picture and chat
    loginBtn.innerHTML = `
      <img src="${keycloak.tokenParsed?.picture || 'default-profile.png'}" 
           class="profile-pic" 
           alt="Profile">
    `;
    loginBtn.href = './profile.html';
    loginContainer.style.display = 'none';
    chatContainer.style.display = 'block';
  } else {
    // User not logged in - show login button and prompt
    loginBtn.innerHTML = 'Login';
    loginBtn.href = '#';
    loginBtn.onclick = () => keycloak.login();
    loginContainer.style.display = 'block';
    chatContainer.style.display = 'none';
  }
}

// Setup login prompt button
document.getElementById('login-prompt-btn')?.addEventListener('click', () => {
  keycloak.login();
});

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initAuth);

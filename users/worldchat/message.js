// User profile cache
const userProfiles = {};

// Wait for Keycloak to initialize
function initMessageApp() {
  if (!keycloak.authenticated) {
    setTimeout(initMessageApp, 100);
    return;
  }

  // Fetch user profile
  async function fetchUserProfile(username) {
    if (userProfiles[username]) return userProfiles[username];
    
    try {
      const token = keycloak.token;
      const response = await fetch(`https://users.app.codecollective.us/users/${encodeURIComponent(username)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const profile = await response.json();
        userProfiles[username] = profile;
        return profile;
      }
    } catch (err) {
      console.error('Error fetching user profile:', err);
    }
    // First try Keycloak's avatar, then default
    return {
      display_name: username,
      picture: keycloak.tokenParsed?.avatar || 
               keycloak.tokenParsed?.picture || 
               'https://codecollective.us/images/default-profile.png'
    };
  }

  // Rest of the message app initialization
  const messagesContainer = document.getElementById('messages');
  const messageInput = document.getElementById('message-input');
  const sendButton = document.getElementById('send-button');
  const languageSelect = document.getElementById('language-select');
  let lastFetchTime = '1970-01-01T00:00:00Z'; // Beginning of Unix epoch
  let currentLanguage = localStorage.getItem('selectedLanguage') || 'en';

  // Fetch available languages
  async function fetchLanguages() {
    try {
      const token = keycloak.token;
      const response = await fetch('https://users.app.codecollective.us/languages', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        languageSelect.innerHTML = '';
        data.languages.forEach(lang => {
          const option = document.createElement('option');
          option.value = lang;
          option.textContent = lang.toUpperCase();
          if (lang === currentLanguage) option.selected = true;
          languageSelect.appendChild(option);
        });
      }
    } catch (err) {
      console.error('Error fetching languages:', err);
    }
  }

  // Handle language change
  languageSelect.addEventListener('change', () => {
    currentLanguage = languageSelect.value;
    localStorage.setItem('selectedLanguage', currentLanguage);
    lastFetchTime = '1970-01-01T00:00:00Z'; // Reset to fetch all messages
    messagesContainer.innerHTML = ''; // Clear existing messages
    fetchMessages();
  });

  // Function to add a new message to the chat
  async function addMessage(text, sender, timestamp, isSent = true) {
    const profile = await fetchUserProfile(sender);
    const messageArticle = document.createElement('article');
    messageArticle.classList.add('message');
    messageArticle.classList.add(isSent ? 'sent' : 'received');
    messageArticle.setAttribute('aria-label', `Message from ${profile.display_name || sender}`);
    
    const figure = document.createElement('figure');
    figure.classList.add('message-figure');
    
    const avatar = document.createElement('img');
    avatar.src = profile.picture || 'https://codecollective.us/images/default-profile.png';
    avatar.classList.add('message-avatar');
    avatar.alt = `${profile.display_name || sender}'s profile picture`;
    avatar.onerror = () => {
      avatar.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZD0iTTEyLDJBMTAsMTAgMCAwLDAgMiwxMkExMCwxMCAwIDAsMCAxMiwyMkExMCwxMCAwIDAsMCAyMiwxMkExMCwxMCAwIDAsMCAxMiwyTTEyLDRBNyw3IDAgMCwxIDE5LDExQTcsNyAwIDAsMSAxMiwxOEE3LDcgMCAwLDEgNSwxMUE3LDcgMCAwLDEgMTIsNE0xMiw2QTUsNSAwIDAsMCA3LDExQTUsNSAwIDAsMCAxMiwxNkE1LDUgMCAwLDAgMTcsMTFBNSw1IDAgMCwwIDEyLDZNNiwxMkE2LDYgMCAwLDAgMTIsNjhBNiw2IDAgMCwwIDE4LDEyQTUsNSAwIDAsMSAxMiwxN0E1LDUgMCAwLDEgNiwxMloiLz48L3N2Zz4=';
    };
    
    const figcaption = document.createElement('figcaption');
    figcaption.classList.add('message-author');
    figcaption.textContent = profile.display_name || sender;
    
    figure.appendChild(avatar);
    figure.appendChild(figcaption);
    
    const messageContent = document.createElement('div');
    messageContent.classList.add('message-content');
    
    const timeElem = document.createElement('time');
    timeElem.dateTime = new Date(timestamp).toISOString();
    timeElem.classList.add('message-time');
    timeElem.textContent = new Date(timestamp).toLocaleString();
    
    const textElem = document.createElement('p');
    textElem.classList.add('message-text');
    textElem.textContent = text;
    
    messageContent.appendChild(timeElem);
    messageContent.appendChild(textElem);
    
    messageArticle.appendChild(figure);
    messageArticle.appendChild(messageContent);
    messagesContainer.appendChild(messageArticle);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // Fetch messages from API
  async function fetchMessages() {
    try {
      const token = keycloak.token;
      const response = await fetch(`https://users.app.codecollective.us/messages/${currentLanguage}?since=${lastFetchTime}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.messages.length > 0) {
          data.messages.forEach(msg => {
            addMessage(msg.text, msg.sender, msg.timestamp, msg.sender === keycloak.tokenParsed?.preferred_username);
          });
        }
        lastFetchTime = new Date().toISOString();
      }
    } catch (err) {
      console.error('Error fetching messages:', err);
    }
  }

  // Send message to API
  async function sendMessage(text) {
    try {
      if (!keycloak.authenticated) {
        await keycloak.updateToken(30);
      }
      const token = keycloak.token;
      const response = await fetch('https://users.app.codecollective.us/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: text,
          sender: keycloak.tokenParsed?.preferred_username || 'anonymous',
          timestamp: new Date().toISOString(),
          metadata: {}
        })
      });
      
      await fetchMessages();
      
      if (!response.ok) {
        throw new Error('Failed to send message');
      }
    } catch (err) {
      console.error('Error sending message:', err);
    }
  }

  // Handle send button click
  sendButton.addEventListener('click', async () => {
    const message = messageInput.value.trim();
    if (message) {
      await sendMessage(message);
      messageInput.value = '';
    }
  });

  // Handle Enter key press
  messageInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
      sendButton.click();
    }
  });

  // Clear existing messages and fetch all history
  messagesContainer.innerHTML = '';
  fetchLanguages().then(fetchMessages);

  // Refresh token every 5 minutes (300 seconds)
  setInterval(() => {
    if (keycloak.authenticated) {
      keycloak.updateToken(30).catch(err => {
        console.error('Failed to refresh token:', err);
      });
    }
  }, 300000);

  // WebSocket connection
  let socket;
  let authenticated = false;
  
  function connectWebSocket() {
    if (socket) socket.close();
    authenticated = false;
    
    // Connect without any auth headers
    const wsUrl = `wss://users.app.codecollective.us/ws/messages`;
    socket = new WebSocket(wsUrl);
    
    socket.onopen = () => {
      console.log('WebSocket connected, authenticating...');
      // Send auth as first message
      socket.send(JSON.stringify({
        type: 'auth',
        token: keycloak.token
      }));
    };
    
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (!authenticated) {
        // Handle auth response
        if (data.type === 'auth-success') {
          authenticated = true;
          console.log('WebSocket authentication successful');
          // Request initial messages after auth
          socket.send(JSON.stringify({
            type: 'get-initial-messages'
          }));
        } else if (data.type === 'auth-failure') {
          console.error('WebSocket authentication failed:', data.message);
          socket.close();
        }
        return;
      }
      
      // Handle message types
      if (data.type === 'initial_messages') {
        // Add all initial messages
        data.messages.forEach(msg => {
          addMessage(msg.text, msg.sender, msg.timestamp,
            msg.sender === keycloak.tokenParsed?.preferred_username);
        });
      } else if (data.type === 'message') {
        // Add single new message
        addMessage(data.text, data.sender, data.timestamp,
          data.sender === keycloak.tokenParsed?.preferred_username);
      }
    };
    
    socket.onclose = (event) => {
      console.log(`WebSocket closed (code: ${event.code}), reconnecting...`);
      setTimeout(connectWebSocket, 3000);
    };
    
    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      // Refresh token on auth errors
      if (error.message.includes('403')) {
        keycloak.updateToken(30).then(connectWebSocket);
      }
    };
  }
  
  connectWebSocket();
}

// Start the message app after auth is ready
document.addEventListener('DOMContentLoaded', initMessageApp);

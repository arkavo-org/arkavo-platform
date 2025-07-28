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
  let lastFetchTime = '1970-01-01T00:00:00Z'; // Beginning of Unix epoch
  let currentLanguage = localStorage.getItem('selectedLanguage') || 'en';

  // Language code exceptions for flag mapping (where language code != country code)
  const languageFlags = {
    'en': 'us',     // English -> USA flag
    'sq': 'al',     // Albanian -> Albania flag
    'ar': 'sa',     // Arabic -> Saudi Arabia flag
    'az': 'az',     // Azerbaijani -> Azerbaijan flag
    'eu': 'es',     // Basque -> Spain flag (Basque Country is in Spain)
    'bn': 'bd',     // Bengali -> Bangladesh flag
    'bg': 'bg',     // Bulgarian -> Bulgaria flag
    'ca': 'es',     // Catalan -> Spain flag (Catalonia is in Spain)
    'zh-Hans': 'cn',// Simplified Chinese -> China flag
    'zh-Hant': 'cn',// Traditional Chinese -> China flag
    'cs': 'cz',     // Czech -> Czech Republic flag
    'da': 'dk',     // Danish -> Denmark flag
    'nl': 'nl',     // Dutch -> Netherlands flag
    'eo': 'eo',     // Esperanto -> Esperanto flag (special case)
    'et': 'ee',     // Estonian -> Estonia flag
    'fi': 'fi',     // Finnish -> Finland flag
    'fr': 'fr',     // French -> France flag
    'gl': 'es',     // Galician -> Spain flag (Galicia is in Spain)
    'de': 'de',     // German -> Germany flag
    'el': 'gr',     // Greek -> Greece flag
    'he': 'il',     // Hebrew -> Israel flag
    'hi': 'in',     // Hindi -> India flag
    'hu': 'hu',     // Hungarian -> Hungary flag
    'id': 'id',     // Indonesian -> Indonesia flag
    'ga': 'ie',     // Irish -> Ireland flag
    'it': 'it',     // Italian -> Italy flag
    'ja': 'jp',     // Japanese -> Japan flag
    'ko': 'kr',     // Korean -> South Korea flag
    'ky': 'kg',     // Kyrgyz -> Kyrgyzstan flag
    'lv': 'lv',     // Latvian -> Latvia flag
    'lt': 'lt',     // Lithuanian -> Lithuania flag
    'ms': 'my',     // Malay -> Malaysia flag
    'nb': 'no',     // Norwegian Bokmål -> Norway flag
    'fa': 'ir',     // Persian -> Iran flag
    'pl': 'pl',     // Polish -> Poland flag
    'pt': 'pt',     // Portuguese -> Portugal flag
    'pt-BR': 'br',  // Brazilian Portuguese -> Brazil flag
    'ro': 'ro',     // Romanian -> Romania flag
    'ru': 'ru',     // Russian -> Russia flag
    'sk': 'sk',     // Slovak -> Slovakia flag
    'sl': 'si',     // Slovenian -> Slovenia flag
    'es': 'es',     // Spanish -> Spain flag
    'sv': 'se',     // Swedish -> Sweden flag
    'tl': 'ph',     // Tagalog -> Philippines flag
    'th': 'th',     // Thai -> Thailand flag
    'tr': 'tr',     // Turkish -> Turkey flag
    'uk': 'ua',     // Ukrainian -> Ukraine flag
    'ur': 'pk'      // Urdu -> Pakistan flag
  };

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
        const languageGrid = document.querySelector('.language-grid');
        languageGrid.innerHTML = '';

        data.languages.forEach(lang => {
          const flagClass = languageFlags[lang] || lang; // Use exception or default to language code
          const option = document.createElement('div');
          option.className = 'language-option';
          option.dataset.lang = lang;
          option.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
              <span class="fi fi-${flagClass}" style="font-size: 1.5em;"></span>
              <span>${lang.toUpperCase()}</span>
            </div>
          `;
          option.addEventListener('click', () => {
            currentLanguage = lang;
            localStorage.setItem('selectedLanguage', currentLanguage);
            document.getElementById('language-dropdown-btn').innerHTML = `
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="fi fi-${flagClass}"></span>
                <span>${lang.toUpperCase()}</span>
              </div>
            `;
            lastFetchTime = '1970-01-01T00:00:00Z'; // Reset to fetch all messages
            messagesContainer.innerHTML = ''; // Clear existing messages
            fetchMessages();
          });

          if (lang === currentLanguage) {
            document.getElementById('language-dropdown-btn').innerHTML = `
              <span class="fi fi-${flagClass}"></span> ${lang.toUpperCase()}
            `;
          }

          languageGrid.appendChild(option);
        });
      }
    } catch (err) {
      console.error('Error fetching languages:', err);
    }
  }

  // Language change is now handled in the fetchLanguages() function
  // when clicking language options in the dropdown

  // Track seen message IDs for deduplication
  const seenMessageIds = new Set();

  // Function to add a new message to the chat
  async function addMessage(text, sender, timestamp, isSent = true, id = null) {
    // Skip if we've already seen this message ID
    if (id && seenMessageIds.has(id)) return;
    if (id) seenMessageIds.add(id);
    const profile = await fetchUserProfile(sender);
    const messageArticle = document.createElement('article');
    messageArticle.classList.add('message');
    messageArticle.classList.add(isSent ? 'sent' : 'received');
    messageArticle.setAttribute('aria-label', `Message from ${profile.display_name || sender}`);
    if (id) {
      messageArticle.dataset.messageId = id;
    }

    const figure = document.createElement('figure');
    figure.classList.add('message-figure');

    const avatar = document.createElement('img');
    // First try profile picture from user record
    avatar.src = profile.picture ||
      // Then try Keycloak avatar
      keycloak.tokenParsed?.picture ||
      // Finally fall back to default
      'https://codecollective.us/images/default-profile.png';
    avatar.classList.add('message-avatar');
    avatar.alt = `${profile.display_name || sender}'s profile picture`;
    avatar.onerror = () => {
      // If image fails to load, use fallback
      avatar.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZD0iTTEyLDJBMTAsMTAgMCAwLDAgMiwxMkExMCwxMCAwIDAsMCAxMiwyMkExMCwxMCAwIDAsMCAyMiwxMkExMCwxMCAwIDAsMCAxMiwyTTEyLDRBNyw3IDAgMCwxIDE5LDExQTcsNyAwIDAsMSAxMiwxOEE3LDcgMCAwLDEgNSwxMVE3LDcgMCAwLDEgMTIsNE0xMiw2QTUsNSAwIDAsMCA3LDExQTUsNSAwIDAsMCAxMiwxNkE1LDUgMCAwLDAgMTcsMTFBNSw1IDAgMCwwIDEyLDZNNiwxMkE2LDYgMCAwLDAgMTIsNjhBNiw2IDAgMCwwIDE4LDEyQTUsNSAwIDAsMSAxMiwxN0E1LDUgMCAwLDEgNiwxMloiLz48L3N2Zz4=';
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
            addMessage(msg.text, msg.sender, msg.timestamp, 
              msg.sender === keycloak.tokenParsed?.preferred_username,
              msg.id);
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
    return response;
  }

  // Add temporary message with optimistic UI
  function addTempMessage(text) {
    const tempId = 'temp-' + Date.now();
    const messageArticle = document.createElement('article');
    messageArticle.id = tempId;
    messageArticle.classList.add('message', 'temp-message');
    messageArticle.setAttribute('aria-label', 'Sending message...');

    const figure = document.createElement('figure');
    figure.classList.add('message-figure');

    const avatar = document.createElement('img');
    avatar.src = keycloak.tokenParsed?.picture ||
      'https://codecollective.us/images/default-profile.png';
    avatar.classList.add('message-avatar');
    avatar.alt = 'Your profile picture';

    const figcaption = document.createElement('figcaption');
    figcaption.classList.add('message-author');
    figcaption.textContent = keycloak.tokenParsed?.preferred_username || 'You';

    figure.appendChild(avatar);
    figure.appendChild(figcaption);

    const messageContent = document.createElement('div');
    messageContent.classList.add('message-content');

    const timeElem = document.createElement('time');
    timeElem.dateTime = new Date().toISOString();
    timeElem.classList.add('message-time');
    timeElem.textContent = 'Sending...';

    const textElem = document.createElement('p');
    textElem.classList.add('message-text', 'temp-text');
    textElem.textContent = text;

    messageContent.appendChild(timeElem);
    messageContent.appendChild(textElem);

    messageArticle.appendChild(figure);
    messageArticle.appendChild(messageContent);
    messagesContainer.appendChild(messageArticle);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    return tempId;
  }

  // Handle send button click
  sendButton.addEventListener('click', async () => {
    const message = messageInput.value.trim();
    if (message) {
      const tempId = addTempMessage(message);
      try {
        // Clear input immediately when sending starts
        messageInput.value = '';
        const response = await sendMessage(message);
        // Only remove temp message if we got a successful response
        if (response && response.ok) {
          document.getElementById(tempId)?.remove();
        } else {
          throw new Error('Failed to send message');
        }
      } catch (err) {
        const tempMessage = document.getElementById(tempId);
        if (tempMessage) {
          tempMessage.classList.add('error');
          const timeElement = tempMessage.querySelector('.message-time');
          if (timeElement) {
            timeElement.textContent = 'Failed to send';
          }
        }
      }
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

  // Revised WebSocket connection
  function connectWebSocket() {
    if (socket) socket.close();

    const wsUrl = `wss://users.app.codecollective.us/ws/messages`;
    socket = new WebSocket(wsUrl);
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const reconnectDelay = 3000; // 3 seconds

    socket.onopen = () => {
      reconnectAttempts = 0;
      console.log('WebSocket connected, authenticating...');
      socket.send(JSON.stringify({
        type: 'auth',
        token: keycloak.token
      }));
    };

    socket.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'auth-success') {
        console.log('WebSocket authenticated');
        // No need to request initial messages - server sends them automatically
      }
      else if (data.type === 'initial-messages') {
        // Clear existing messages and seen IDs
        messagesContainer.innerHTML = '';
        seenMessageIds.clear();
        // Add all initial messages
        data.messages.forEach(msg => {
          addMessage(msg.text, msg.sender, msg.timestamp,
            msg.sender === keycloak.tokenParsed?.preferred_username,
            msg.id);
        });
      }
      else if (data.type === 'new-message') {
        addMessage(data.message.text, data.message.sender, data.message.timestamp,
          data.message.sender === keycloak.tokenParsed?.preferred_username,
          data.message.id);
      }
    };

    socket.onclose = (event) => {
      if (reconnectAttempts < maxReconnectAttempts) {
        const delay = reconnectAttempts * reconnectDelay;
        console.log(`WebSocket closed, reconnecting in ${delay}ms...`);
        setTimeout(() => {
          reconnectAttempts++;
          connectWebSocket();
        }, delay);
      } else {
        console.error('Max reconnection attempts reached');
      }
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  connectWebSocket();
}

// Initialize dropdown functionality
function initDropdown() {
  const dropdownBtn = document.getElementById('language-dropdown-btn');
  const dropdown = document.getElementById('language-dropdown');

  if (!dropdownBtn || !dropdown) {
    console.error('Dropdown elements not found');
    return;
  }

  dropdownBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('show');
    console.log('Dropdown toggled');
  });

  document.addEventListener('click', () => {
    dropdown.classList.remove('show');
  });

  console.log('Dropdown initialized');
}

// Start the message app after auth is ready
document.addEventListener('DOMContentLoaded', () => {
  initDropdown();
  initMessageApp();
});

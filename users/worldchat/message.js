document.addEventListener('DOMContentLoaded', () => {
  const messagesContainer = document.getElementById('messages');
  const messageInput = document.getElementById('message-input');
  const sendButton = document.getElementById('send-button');

  // Function to add a new message to the chat
  function addMessage(text, isSent = true) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    messageDiv.classList.add(isSent ? 'sent' : 'received');
    messageDiv.textContent = text;
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // Handle send button click
  sendButton.addEventListener('click', () => {
    const message = messageInput.value.trim();
    if (message) {
      addMessage(message);
      messageInput.value = '';
    }
  });

  // Handle Enter key press
  messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendButton.click();
    }
  });

  // Sample messages (can be removed in production)
  addMessage('Welcome to World Chat!', false);
  addMessage('Type a message and press Send or Enter to chat.', false);
});

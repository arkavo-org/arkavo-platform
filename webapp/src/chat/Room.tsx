import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import '../css/ChatPage.css';

interface Message {
  text: string;
  sender: string;
  timestamp: string;
}

interface RoomProps {
  roomId: string;
}

const Room: React.FC<RoomProps> = ({ roomId }) => {
  const { keycloak } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [ws, setWs] = useState<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch messages only when roomId changes
  useEffect(() => {
    const fetchMessages = async () => {
      const url = `${import.meta.env.VITE_USERS_API_URL}/rooms/${roomId}/messages`;
      console.log(`Fetching messages from: ${url}`);
      try {
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${keycloak.token}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          console.log('Fetched messages:', data.messages);
          setMessages(data.messages);
        } else {
          console.error('Failed to fetch messages:', {
            status: response.status,
            statusText: response.statusText,
            url: url
          });
        }
      } catch (error) {
        console.error('Error fetching messages:', {
          error: error,
          url: url
        });
      }
    };

    fetchMessages();
  }, [roomId]);

  // Handle WebSocket connection only when roomId changes
  useEffect(() => {
    const wss_url = `${import.meta.env.VITE_USERS_WSS_URL}/ws/rooms/${roomId}`;
    console.log(`Attempting WebSocket connection to: ${wss_url}`);
    const socket = new WebSocket(wss_url);
    
    const handleAuth = () => {
      console.log(`WebSocket connection established to ${wss_url}`);
      socket.send(JSON.stringify({
        type: 'auth',
        token: keycloak.token
      }));
    };

    socket.onopen = handleAuth;
    socket.onerror = (error) => console.error('WebSocket error:', error);
    socket.onclose = (event) => console.log(`WebSocket closed: ${event.code} - ${event.reason}`);

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('Received message:', message);
        
        if (message.type === 'auth-failure') {
          console.error('WebSocket auth failed:', message.message);
          return;
        }

        if (message.text && message.sender && message.timestamp) {
          setMessages(prev => [...prev, message]);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error, event.data);
      }
    };

    setWs(socket);

    return () => {
      socket.close();
    };
  }, [roomId]);

  // Update WebSocket auth when token changes
  useEffect(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'auth',
        token: keycloak.token
      }));
    }
  }, [keycloak.token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;

    try {
      const response = await fetch(`${import.meta.env.VITE_USERS_API_URL}/rooms/${roomId}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${keycloak.token}`
        },
        body: JSON.stringify({
          text: newMessage,
          sender: keycloak.tokenParsed?.preferred_username || 'anonymous',
          timestamp: new Date().toISOString()
        })
      });

      if (response.ok) {
        setNewMessage('');
      } else {
        console.error('Failed to send message:', response.status);
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="chat-area">
      
      <div className="message-area">
        {messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()).map((msg, index) => (
          <div key={index} className="message-item">
            <div className="room-avatar">{(msg.sender || '?').charAt(0).toUpperCase()}</div>
            <div>
              <div className="message-user">{msg.sender || 'Unknown'}</div>
              <div className="message-text">{msg.text}</div>
              <div className="message-time">{new Date(msg.timestamp).toLocaleTimeString()}</div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="message-input" style={{marginTop: '20px', display: 'flex'}}>
        <textarea
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="Type a message..."
          style={{flex: 1, marginRight: '10px', padding: '10px'}}
        />
        <button onClick={handleSendMessage} style={{padding: '10px 20px'}}>Send</button>
      </div>
    </div>
  );
};

export default Room;

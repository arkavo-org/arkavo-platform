import React, { useState, useEffect, useRef } from 'react';
import { useKeycloak } from '@react-keycloak/web';
import '../css/ChatPage.css';

interface Message {
  text: string;
  user: string;
  timestamp: string;
}

interface RoomProps {
  roomId: string;
}

const Room: React.FC<RoomProps> = ({ roomId }) => {
  const { keycloak } = useKeycloak();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [ws, setWs] = useState<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_USERS_API_URL}/rooms/${roomId}messages`);
        if (response.ok) {
          const data = await response.json();
          setMessages(data.messages);
        }
      } catch (error) {
        console.error('Error fetching messages:', error);
      }
    };

    fetchMessages();

    const socket = new WebSocket(`${import.meta.env.VITE_USERS_WS_URL}/ws/rooms/${roomId}`);
    
    socket.onopen = () => {
      socket.send(JSON.stringify({
        type: 'auth',
        token: keycloak.token
      }));
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      setMessages(prev => [...prev, message]);
    };

    setWs(socket);

    return () => {
      socket.close();
    };
  }, [roomId, keycloak.token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = () => {
    if (!newMessage.trim() || !ws) return;

    ws.send(JSON.stringify({
      type: 'message',
      text: newMessage
    }));

    setNewMessage('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="chat-area">
      <div className="room-item selected">
        <div className="room-avatar">{roomId.charAt(0).toUpperCase()}</div>
        <div>
          <h4>Room: {roomId}</h4>
        </div>
      </div>
      
      <div className="rooms-list">
        {messages.map((msg, index) => (
          <div key={index} className="room-item">
            <div className="room-avatar">{msg.user.charAt(0).toUpperCase()}</div>
            <div>
              <div className="message-user">{msg.user}</div>
              <div className="message-text">{msg.text}</div>
              <div className="message-time">{new Date(msg.timestamp).toLocaleTimeString()}</div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="add-room" style={{marginTop: '20px', display: 'flex'}}>
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

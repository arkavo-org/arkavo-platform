import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import '../css/ChatPage.css';
import Profile from '../Profile';
import UserProfile from '../UserProfile';

interface Attachment {
  data: string; // base64 encoded
  mimeType: string;
  dataUrl?: string; // Optional data URL for immediate display
}

interface Message {
  text: string;
  sender: string;
  timestamp: string;
  attachments?: Attachment[];
}

interface RoomProps {
  roomId: string;
}

import { useNavigate, useParams } from 'react-router-dom';

const Room: React.FC<RoomProps> = ({ roomId: initialRoomId }) => {
  const { keycloak } = useAuth();
  const navigate = useNavigate();
  const params = useParams();
  const [roomId, setRoomId] = useState<string>(() => {
    // Try to get from localStorage first, fallback to prop
    const savedRoomId = localStorage.getItem('currentRoomId');
    const currentRoomId = savedRoomId || initialRoomId;
    
    // Update URL if needed (initial load)
    if (params.roomId !== currentRoomId) {
      navigate(`/chat/${currentRoomId}`, { replace: true });
    }
    return currentRoomId;
  });

  // Update URL whenever roomId changes (including after joining)
  useEffect(() => {
    if (params.roomId !== roomId) {
      navigate(`/chat/${roomId}`, { replace: true });
      localStorage.setItem('currentRoomId', roomId);
    }
  }, [roomId, params.roomId, navigate]);

  // Persist roomId to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('currentRoomId', roomId);
  }, [roomId]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [profiles, setProfiles] = useState<{[key: string]: {display_name: string, picture: string}}>({});

  const fetchProfile = useCallback(async (userId: string) => {
    if (!keycloak || !userId || profiles[userId]) return;

    try {
      if (keycloak.isTokenExpired()) {
        await keycloak.updateToken(30);
      }

      const response = await fetch(
        `${import.meta.env.VITE_USERS_API_URL}/profile/${userId}`,
        {
          headers: {
            Authorization: `Bearer ${keycloak.token}`
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setProfiles(prev => ({
          ...prev,
          [userId]: {
            display_name: data.display_name || userId,
            picture: data.picture || ''
          }
        }));
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  }, [keycloak, profiles]);
  const [newMessage, setNewMessage] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showUserProfileModal, setShowUserProfileModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch messages when roomId changes or keycloak authentication status changes
  useEffect(() => {
    const fetchMessages = async () => {
      if (!keycloak?.authenticated) return;
      
      const url = `${import.meta.env.VITE_USERS_API_URL}/rooms/${roomId}/messages`;
      console.log(`Fetching messages from: ${url}`);
      try {
        // Refresh token if needed
        if (keycloak?.isTokenExpired()) {
          await keycloak.updateToken(30);
        }
        
        const token = keycloak?.token;
        if (!token) {
          console.error('No token available');
          return;
        }
        
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          console.log('Fetched messages:', data.messages);
          setMessages(data.messages);
          // Fetch profiles for all unique senders
          const uniqueSenders = [...new Set(data.messages.map((m: Message) => m.sender))].filter(
            (sender): sender is string => typeof sender === 'string'
          );
          uniqueSenders.forEach(sender => {
            // Always use the message sender's ID
            fetchProfile(sender);
          });
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
  }, [roomId, keycloak?.authenticated]);

  // Handle WebSocket connection when roomId changes or keycloak authentication status changes
  useEffect(() => {
    if (!keycloak?.authenticated) return;

    const wss_url = `${import.meta.env.VITE_USERS_WSS_URL}/ws/rooms/${roomId}`;
    console.log(`Attempting WebSocket connection to: ${wss_url}`);
    const socket = new WebSocket(wss_url);
    
    const handleAuth = async () => {
      try {
        if (keycloak?.isTokenExpired()) {
          await keycloak.updateToken(30);
        }
        
        const token = keycloak?.token;
        if (!token) {
          console.error('No token available for WebSocket auth');
          socket.close();
          return;
        }

        console.log(`WebSocket connection established to ${wss_url}`);
        socket.send(JSON.stringify({
          type: 'auth',
          token: token
        }));
      } catch (error) {
        console.error('Error during WebSocket auth:', error);
        socket.close();
      }
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

        if (message.sender && message.timestamp) {
          // Convert any attachments to data URLs for immediate display
          const processedMessage = {
            ...message,
            attachments: message.attachments?.map((att: Attachment) => ({
              ...att,
              dataUrl: `data:${att.mimeType};base64,${att.data}`
            }))
          };
          setMessages(prev => [...prev, processedMessage]);
          if (typeof message.sender === 'string') {
            // Always use the message sender's ID
            if (!profiles[message.sender]) {
              fetchProfile(message.sender);
            }
          }
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error, event.data);
      }
    };

    setWs(socket);

    return () => {
      socket.close();
    };
  }, [roomId, keycloak?.authenticated]);

  // Update WebSocket auth when token changes
  useEffect(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'auth',
        token: keycloak?.token
      }));
    }
  }, [keycloak?.token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

    const detectFileType = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const arr = new Uint8Array(e.target?.result as ArrayBuffer).subarray(0, 4);
        let header = '';
        for (let i = 0; i < arr.length; i++) {
          header += arr[i].toString(16);
        }
        
        // Check known file signatures
        switch (header) {
          case '89504e47': resolve('image/png'); break;
          case '47494638': resolve('image/gif'); break;
          case 'ffd8ffe0':
          case 'ffd8ffe1':
          case 'ffd8ffe2':
          case 'ffd8ffe3':
          case 'ffd8ffe8': resolve('image/jpeg'); break;
          case '66747970': resolve('video/mp4'); break;
          case '1a45dfa3': resolve('video/webm'); break;
          default: resolve(file.type || 'application/octet-stream');
        }
      };
      reader.readAsArrayBuffer(file.slice(0, 4));
    });
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() && selectedFiles.length === 0) return;

    try {
      // Refresh token if needed
      if (keycloak?.isTokenExpired()) {
        await keycloak.updateToken(30);
      }

      // Process attachments
      const attachments = await Promise.all(
        selectedFiles.map(async (file) => {
          const detectedType = await detectFileType(file);
          const base64Data = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.readAsDataURL(file);
          });
          
          return {
            data: base64Data,
            mimeType: detectedType
          };
        })
      );

      const message = {
        text: newMessage,
        sender: keycloak?.tokenParsed?.sub || "user",
        timestamp: new Date().toISOString(),
        attachments: attachments.length > 0 ? attachments.map(att => ({
          data: att.data,
          mimeType: att.mimeType
        })) : undefined,
        metadata: {} // Ensure metadata exists even if empty
      };

      const response = await fetch(`${import.meta.env.VITE_USERS_API_URL}/rooms/${roomId}/message`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${keycloak?.token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(message, (key, value) => 
          value === undefined ? null : value // Convert undefined to null
        )
      });

      if (response.ok) {
        setNewMessage('');
        setSelectedFiles([]); // Clear attachments on successful send
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files).filter(file => 
        file.type.startsWith('image/') || file.type.startsWith('video/')
      );
      if (files.length > 0) {
        setSelectedFiles(prev => [...prev, ...files]);
      }
    }
  };

  const [isMember, setIsMember] = useState(false);

  useEffect(() => {
    const checkRoomMembership = async () => {
      if (!keycloak?.tokenParsed?.sub || !keycloak?.authenticated) return;

      try {
        if (keycloak.isTokenExpired()) {
          await keycloak.updateToken(30);
        }

        const response = await fetch(
          `${import.meta.env.VITE_USERS_API_URL}/user/rooms`,
          {
            headers: {
              Authorization: `Bearer ${keycloak.token}`
            }
          }
        );

        if (response.ok) {
          const data = await response.json();
          setIsMember(data.rooms.some((r: {id: string}) => r.id === roomId));
        }
      } catch (error) {
        console.error('Error checking room membership:', error);
      }
    };

    checkRoomMembership();
  }, [roomId, keycloak, keycloak?.authenticated]);

  const handleJoinRoom = async () => {
    try {
      if (keycloak?.isTokenExpired()) {
        await keycloak.updateToken(30);
      }

      const response = await fetch(
        `${import.meta.env.VITE_USERS_API_URL}/rooms/${roomId}/join`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${keycloak?.token}`
          }
        }
      );

      if (response.ok) {
        setIsMember(true);
        // Update URL to reflect the joined room
        navigate(`/chat/${roomId}`, { replace: true });
        // Refresh the room list by calling the original fetch messages function
        const fetchMessages = async () => {
          const url = `${import.meta.env.VITE_USERS_API_URL}/rooms/${roomId}/messages`;
          const response = await fetch(url, {
            headers: {
              'Authorization': `Bearer ${keycloak?.token}`
            }
          });
          if (response.ok) {
            const data = await response.json();
            setMessages(data.messages);
          }
        };
        fetchMessages();
      }
    } catch (error) {
      console.error('Error joining room:', error);
    }
  };

  return (
    <div className="chat-area">
      {expandedImage && (
        <div className="image-expanded-overlay" onClick={() => setExpandedImage(null)}>
          <div className="image-expanded-container">
            <span 
              className="close-expanded-image"
              onClick={(e) => {
                e.stopPropagation();
                setExpandedImage(null);
              }}
            >
              ×
            </span>
            <img 
              src={expandedImage} 
              className="expanded-image"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
      
      <div className="message-area">
        {messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()).map((msg, index) => (
          <div key={index} className="message-item">
            {profiles[msg.sender]?.picture ? (
              <img 
                src={profiles[msg.sender].picture.startsWith('data:') ? 
                  profiles[msg.sender].picture : 
                  `data:image/jpeg;base64,${profiles[msg.sender].picture}`} 
                className="room-avatar" 
                alt={profiles[msg.sender].display_name}
                onClick={() => {
                  if (msg.sender === keycloak?.tokenParsed?.sub) {
                    setShowProfileModal(true);
                  } else {
                    setSelectedUserId(msg.sender);
                    setShowUserProfileModal(true);
                  }
                }}
                style={{cursor: 'pointer'}}
              />
            ) : (
              <div 
                className="room-avatar"
                onClick={() => {
                  if (msg.sender === keycloak?.tokenParsed?.sub) {
                    setShowProfileModal(true);
                  } else {
                    setSelectedUserId(msg.sender);
                    setShowUserProfileModal(true);
                  }
                }}
                style={{cursor: 'pointer'}}
              >
                {(msg.sender || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <div className="message-user">
                {profiles[msg.sender]?.display_name || 'Unknown'}
              </div>
              <div className="message-text">{msg.text}</div>
        {msg.attachments?.map((attachment, i) => {
          const dataUrl = attachment.dataUrl || `data:${attachment.mimeType};base64,${attachment.data}`;
          
          return (
            <div key={i} className="media-container">
              {attachment.mimeType.startsWith('image/') ? (
                <img
                  src={dataUrl}
                  alt="Attachment"
                  className="message-attachment"
                  loading="lazy"
                  onClick={() => setExpandedImage(dataUrl)}
                />
              ) : attachment.mimeType.startsWith('video/') ? (
                <video
                  src={dataUrl}
                  controls
                  className="message-attachment"
                />
              ) : (
                <div className="generic-attachment">
                  [Unsupported media type: {attachment.mimeType}]
                </div>
              )}
            </div>
          );
        })}
              <div className="message-time">{new Date(msg.timestamp).toLocaleTimeString()}</div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {isMember ? (
        <div className="message-input">
          <div 
            className="message-input-container"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Type a message or drag files here..."
              className="message-textarea"
            />
            {selectedFiles.length === 0 && (
              <div className="drop-zone-overlay">
                Drop files here
              </div>
            )}
          </div>
          <input 
            ref={fileInputRef}
            type="file" 
            accept="image/*,video/*" 
            onChange={handleFileChange}
            className="hidden-file-input"
            multiple
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="add-files-button"
          >
            Add Files
          </button>
          {selectedFiles.length > 0 && (
            <div className="file-previews-container">
              {selectedFiles.map((file, index) => (
                <div key={index} className="file-preview">
                  <span 
                    onClick={() => removeFile(index)}
                    className="remove-file-button"
                  >
                    ×
                  </span>
                  {file.type.startsWith('image/') ? (
                    <img 
                      src={URL.createObjectURL(file)} 
                      alt="Preview" 
                      className="image-preview"
                    />
                  ) : (
                    <div className="video-preview-placeholder">
                      <span>🎥</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <button onClick={handleSendMessage} className="send-button">Send</button>
        </div>
      ) : (
        <div className="join-room-container">
          <button onClick={handleJoinRoom} className="join-room-button">
            Join Room
          </button>
        </div>
      )}
    </div>
)};

export default Room;

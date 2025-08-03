import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../context/AuthContext';
import RoomModal from './RoomModal';
import '../css/ChatPage.css';
import Profile from '../Profile';
import MessageInput from './MessageInput';

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

const Room: React.FC<RoomProps> = ({ roomId }) => {
  const { keycloak } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [profiles, setProfiles] = useState<{[key: string]: {display_name: string, picture: string}}>({});

  // Fetch messages when roomId changes
  useEffect(() => {
    if (roomId) {
      console.log(`Loading messages for room: ${roomId}`);
      setMessages([]);
      fetchMessages();
    }
  }, [roomId]);

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
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  // Removed user profile modal state
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

  const [isMember, setIsMember] = useState(false);
  const [showRoomInfoModal, setShowRoomInfoModal] = useState(false);
  const [roomInfo, setRoomInfo] = useState<{
    name: string;
    isPublic: boolean;
    creator?: string;
    admins?: string[];
  } | null>(null);
  const [isEditingRoom, setIsEditingRoom] = useState(false);
  const [editedRoomInfo, setEditedRoomInfo] = useState({
    name: '',
    isPublic: false
  });

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

  const fetchRoomInfo = async () => {
    try {
      if (keycloak?.isTokenExpired()) {
        await keycloak.updateToken(30);
      }

      const response = await fetch(
        `${import.meta.env.VITE_USERS_API_URL}/rooms/${roomId}`,
        {
          headers: {
            Authorization: `Bearer ${keycloak?.token}`
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setRoomInfo(data);
      }
    } catch (error) {
      console.error('Error fetching room info:', error);
    }
  };

  const handleRoomInfoClick = async () => {
    await fetchRoomInfo();
    if (roomInfo) {
      setEditedRoomInfo({
        name: roomInfo.name,
        isPublic: roomInfo.isPublic
      });
    }
    setShowRoomInfoModal(true);
    setIsEditingRoom(false);
  };

  const handleSaveRoom = async () => {
    if (!roomInfo || !keycloak?.token) return;
    
    try {
      if (keycloak.isTokenExpired()) {
        await keycloak.updateToken(30);
      }

      const response = await fetch(
        `${import.meta.env.VITE_USERS_API_URL}/rooms/${roomId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${keycloak.token}`
          },
          body: JSON.stringify(editedRoomInfo)
        }
      );

      if (response.ok) {
        await fetchRoomInfo();
        setIsEditingRoom(false);
      }
    } catch (error) {
      console.error('Error updating room:', error);
    }
  };

  const GetRoomCreateIfDNE = useCallback(async (roomId: string) => {
    try {
      if (keycloak?.isTokenExpired()) {
        await keycloak.updateToken(30);
      }
      
      const response = await fetch(
        `${import.meta.env.VITE_USERS_API_URL}/rooms/${roomId}`,
        {
          headers: {
            Authorization: `Bearer ${keycloak?.token}`
          }
        }
      );
      
      if (!response.ok) {
        console.error('Failed to get/create room:', response.status);
      }
      return response.ok;
    } catch (error) {
      console.error('Error getting/creating room:', error);
      return false;
    }
  }, [keycloak]);

  const handleJoinRoom = async () => {
    try {
      if (keycloak?.isTokenExpired()) {
        await keycloak.updateToken(30);
      }

      const response = await fetch(
        `${import.meta.env.VITE_USERS_API_URL}/rooms/${roomId}/join`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${keycloak?.token}`
          }
        }
      );

      if (response.ok) {
        setIsMember(true);
        // Update URL to reflect the joined room
        navigate(`/chat/${roomId}`, { replace: true });
        
        // Refresh messages for current room
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
        
        // Fetch updated room list
        const fetchUserRooms = async () => {
          const response = await fetch(
            `${import.meta.env.VITE_USERS_API_URL}/user/rooms`,
            {
              headers: {
                Authorization: `Bearer ${keycloak?.token}`
              }
            }
          );
          if (response.ok) {
            const data = await response.json();
            // Trigger room list update in parent via URL change
            navigate(`/chat/${roomId}`, { replace: true });
          }
        };

        await Promise.all([fetchMessages(), fetchUserRooms()]);
      }
    } catch (error) {
      console.error('Error joining room:', error);
    }
  };

  return (
    <div className="chat-area">
      <button 
        onClick={handleRoomInfoClick}
        className="room-info-button"
      >
        <FontAwesomeIcon icon={faInfoCircle} />
      </button>
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

      {showRoomInfoModal && roomInfo && (
        <RoomModal
          roomId={roomId}
          roomInfo={roomInfo}
          editedRoomInfo={editedRoomInfo}
          isEditingRoom={isEditingRoom}
          profiles={profiles}
          onClose={() => setShowRoomInfoModal(false)}
          onSave={handleSaveRoom}
          onEditChange={(field, value) => {
            const newValue = field === 'isPublic' ? Boolean(value) : value;
            setEditedRoomInfo({
              ...editedRoomInfo,
              [field]: newValue
            });
          }}
          onToggleEdit={() => setIsEditingRoom(!isEditingRoom)}
        />
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
                onClick={async () => {
                  const currentUserId = keycloak?.tokenParsed?.sub;
                  if (currentUserId && msg.sender) {
                    const dmRoomId = [currentUserId, msg.sender].sort().join('_');
                    if (await GetRoomCreateIfDNE(dmRoomId)) {
                      navigate(`/chat/${dmRoomId}`);
                    }
                  }
                }}
                style={{cursor: 'pointer'}}
              />
            ) : (
              <div 
                className="room-avatar"
                onClick={async () => {
                  const currentUserId = keycloak?.tokenParsed?.sub;
                  if (currentUserId && msg.sender) {
                    const dmRoomId = [currentUserId, msg.sender].sort().join('_');
                    if (await GetRoomCreateIfDNE(dmRoomId)) {
                      navigate(`/chat/${dmRoomId}`);
                    }
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
              ) : attachment.mimeType === 'application/pdf' ? (
                <div className="pdf-attachment">
                  <div className="pdf-preview">
                    <span>📄</span>
                    <div>PDF Document</div>
                  </div>
                  <a 
                    href={dataUrl} 
                    download={`document-${new Date(msg.timestamp).getTime()}.pdf`}
                    className="pdf-download-button"
                  >
                    Download
                  </a>
                </div>
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
        <MessageInput
          roomId={roomId}
          onSend={fetchMessages}
        />
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

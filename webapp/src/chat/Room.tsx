import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  saveMessagesToDB, 
  getMessagesFromDB, 
  clearMessagesForRoom 
} from "./indexedDBUtils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { useAuth } from "../context/AuthContext";
import { useWebSocket } from "../context/WebSocketContext";
import type { NanoTDFDatasetClient } from "@opentdf/sdk";
import RoomModal from "./RoomModal";
import "../css/ChatPage.css";
import Profile from "../Profile";
import MessageInput from "./MessageInput";

interface RoomProps {
  roomId: string;
}

import { useNavigate, useParams } from "react-router-dom";
import { send } from "process";

const Room: React.FC<RoomProps> = ({ roomId }) => {
  const { keycloak, tdfClient } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<{
    [key: string]: { display_name: string; picture: string };
  }>({});
  const [tdfStatus, setTdfStatus] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");

  useEffect(() => {
    if (tdfClient) {
      console.log("TDF client initialized in Room:", tdfClient);
      setTdfStatus("ready");
    } else {
      console.log("No TDF client available in Room");
      setTdfStatus("unavailable");
    }
  }, [tdfClient]);

  useEffect(() => {
    if (roomId && tdfStatus === "ready") {
      console.log(`Loading messages for room: ${roomId}`);
      setMessages([]);
      fetchMessages(); // now tdfClient is guaranteed available
    }

    return () => {
      // Cleanup when room changes
      if (roomId) {
        clearMessagesForRoom(roomId);
      }
    };
  }, [roomId, tdfStatus]);

  const fetchProfile = useCallback(
    async (userId: string) => {
      if (!keycloak || !userId || profiles[userId]) return;

      try {
        if (keycloak.isTokenExpired()) {
          await keycloak.updateToken(30);
        }

        if (!userId) {
          console.error("No user ID provided");
          return;
        }

        const response = await fetch(
          `${import.meta.env.VITE_USERS_API_URL}/profile/${userId}`,
          {
            headers: {
              Authorization: `Bearer ${keycloak.token}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          setProfiles((prev) => ({
            ...prev,
            [userId]: {
              display_name: data.display_name || userId,
              picture: data.picture || "",
            },
          }));
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
      }
    },
    [keycloak, profiles]
  );
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  // WebSocket connection is now managed at ChatPage level
  const { ws } = useWebSocket();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const decryptTDFMessage = async (content: any) => {
    if (tdfStatus !== "ready") {
      console.error(`TDF client status: ${tdfStatus}`);
      return {
        content: {
          text:
            tdfStatus === "loading"
              ? "[Waiting for TDF security initialization...]"
              : "[Security features unavailable]",
        },
      };
    }

    if (!tdfClient) {
      throw new Error("TDF client not available");
    }

    // Convert base64 string back to ArrayBuffer
    const binaryString = atob(content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const decrypted = await tdfClient.decrypt(bytes.buffer);
    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(decrypted));
  };

  const processMessage = async (message: any) => {
    try {
      // Handle both string and object content
      const contentStr = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
      
      let content;
      let encrypted = false;
      
      if (contentStr.startsWith("TDFMES")) {
        encrypted = true;
        content = await decryptTDFMessage(contentStr);
      } else {
        content = typeof message.content === 'string' 
          ? JSON.parse(message.content)
          : message.content;
      }

      const processedMessage = {
        ...message,
        encrypted,
        content,
        attachments: message.attachments?.map((att: any) => ({
          ...att,
          dataUrl: `data:${att.mimeType};base64,${att.data}`,
        })),
      };

      return processedMessage;
    } catch (error) {
      console.error("Error processing message:", error);
      return {
        ...message,
        encrypted: false,
        content: { text: "[Error processing message]" }
      };
    }
  };

  // Handle incoming messages from the shared WebSocket connection
  useEffect(() => {
    if (!ws) return;

    const handleMessage = async (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        if (message.roomId !== roomId) return;

        const processedMessage = await processMessage(message);
        if (processedMessage.sender && processedMessage.timestamp) {
          setMessages((prev) => [...prev, processedMessage]);
          await saveMessagesToDB(roomId, [processedMessage]);
          if (typeof processedMessage.sender === "string" && !profiles[processedMessage.sender]) {
            fetchProfile(processedMessage.sender);
          }
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error, event.data);
      }
    };

    ws.addEventListener('message', handleMessage);
    return () => {
      ws.removeEventListener('message', handleMessage);
    };
  }, [ws, roomId, profiles, fetchProfile]);

  // Update WebSocket auth when token changes
  useEffect(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "auth",
          token: keycloak?.token,
        })
      );
    }
  }, [keycloak?.token]);

  const fetchMessages = async () => {
    if (!keycloak?.authenticated) return;

    // First try to get messages from IndexedDB
    const cachedMessages = await getMessagesFromDB(roomId);
    if (cachedMessages.length > 0) {
      setMessages(cachedMessages);
    }

    const url = `${
      import.meta.env.VITE_USERS_API_URL
    }/rooms/${roomId}/messages`;
    console.log(`Fetching messages from: ${url}`);

    try {
      // Refresh token if needed
      if (keycloak.isTokenExpired()) {
        await keycloak.updateToken(30);
      }

      const token = keycloak.token;
      if (!token) {
        console.error("No token available");
        return;
      }

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        console.error("Failed to fetch messages:", {
          status: response.status,
          statusText: response.statusText,
          url,
        });
        return;
      }

      const data = await response.json();
      const processedMessages = await Promise.all(
        data.messages.map(processMessage)
      );
      
      setMessages(processedMessages);
      await saveMessagesToDB(roomId, processedMessages);

      // Fetch sender profiles
      const uniqueSenders = [
        ...new Set(processedMessages.map((m: any) => m.sender)),
      ].filter((sender): sender is string => typeof sender === "string");

      uniqueSenders.forEach(fetchProfile);
    } catch (error) {
      console.error("Error fetching messages:", { error, url });
    }
  };

  const [isMember, setIsMember] = useState(false);
  const [showRoomInfoModal, setShowRoomInfoModal] = useState(false);
  const [roomInfo, setRoomInfo] = useState<{
    name: string;
    is_public: number;
    creator?: string;
    admins?: string[];
  } | null>(null);

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
              Authorization: `Bearer ${keycloak.token}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          setIsMember(data.rooms.some((r: { id: string }) => r.id === roomId));
        }
      } catch (error) {
        console.error("Error checking room membership:", error);
      }
    };

    checkRoomMembership();
  }, [roomId, keycloak, keycloak?.authenticated]);

  const fetchRoomInfo = async () => {
    if (!keycloak?.authenticated) {
      console.log("Not authenticated - skipping room info fetch");
      return;
    }

    try {
      if (keycloak?.isTokenExpired()) {
        await keycloak.updateToken(30);
      }

      const token = keycloak?.token;
      if (!token) {
        console.error("No token available for room info fetch");
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_USERS_API_URL}/rooms/${roomId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setRoomInfo(data);
      } else {
        console.error("Failed to fetch room info:", response.status);
      }
    } catch (error) {
      console.error("Error fetching room info:", error);
    }
  };

  const handleRoomInfoClick = async () => {
    await fetchRoomInfo();
    setShowRoomInfoModal(true);
  };

  const handleRoomUpdated = async () => {
    await fetchRoomInfo();
  };

  const GetRoomCreateIfDNE = useCallback(
    async (roomId: string) => {
      try {
        if (keycloak?.isTokenExpired()) {
          await keycloak.updateToken(30);
        }

        const response = await fetch(
          `${import.meta.env.VITE_USERS_API_URL}/rooms/${roomId}`,
          {
            headers: {
              Authorization: `Bearer ${keycloak?.token}`,
            },
          }
        );

        if (!response.ok) {
          console.error("Failed to get/create room:", response.status);
        }
        return response.ok;
      } catch (error) {
        console.error("Error getting/creating room:", error);
        return false;
      }
    },
    [keycloak]
  );

  const handleJoinRoom = async () => {
    try {
      if (keycloak?.isTokenExpired()) {
        await keycloak.updateToken(30);
      }

      const response = await fetch(
        `${import.meta.env.VITE_USERS_API_URL}/rooms/${roomId}/join`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${keycloak?.token}`,
          },
        }
      );

      if (response.ok) {
        setIsMember(true);
        // Update URL to reflect the joined room
        navigate(`/chat/${roomId}`, { replace: true });
      }
    } catch (error) {
      console.error("Error joining room:", error);
    }
  };

  // Load room info when roomId or authentication changes
  useEffect(() => {
    if (keycloak?.authenticated) {
      fetchRoomInfo();
    }
  }, [roomId, keycloak?.authenticated]);

  return (
    <div className="chat-area">
      {expandedImage && (
        <div
          className="image-expanded-overlay"
          onClick={() => setExpandedImage(null)}
        >
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
          profiles={profiles}
          onClose={() => setShowRoomInfoModal(false)}
          onRoomUpdated={handleRoomUpdated}
        />
      )}

      <div className="message-area">
        <button onClick={handleRoomInfoClick} className="room-info-button">
          <FontAwesomeIcon icon={faInfoCircle} />
        </button>
        {messages
          .sort(
            (a, b) =>
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          )
          .map((msg, index) => (
            <div key={index} className={`message-item ${msg.encrypted ? "decrypted" : ""}`}>
              {profiles[msg.sender]?.picture ? (
                <img
                  src={
                    profiles[msg.sender].picture.startsWith("data:")
                      ? profiles[msg.sender].picture
                      : `data:image/jpeg;base64,${profiles[msg.sender].picture}`
                  }
                  className="room-avatar"
                  alt={profiles[msg.sender].display_name}
                  onClick={async () => {
                    const currentUserId = keycloak?.tokenParsed?.sub;
                    if (currentUserId && msg.sender) {
                      const dmRoomId = [currentUserId, msg.sender]
                        .sort()
                        .join("_");
                      if (await GetRoomCreateIfDNE(dmRoomId)) {
                        navigate(`/chat/${dmRoomId}`);
                      }
                    }
                  }}
                  style={{ cursor: "pointer" }}
                />
              ) : (
                <div
                  className="room-avatar"
                  onClick={async () => {
                    const currentUserId = keycloak?.tokenParsed?.sub;
                    if (currentUserId && msg.sender) {
                      const dmRoomId = [currentUserId, msg.sender]
                        .sort()
                        .join("_");
                      if (await GetRoomCreateIfDNE(dmRoomId)) {
                        navigate(`/chat/${dmRoomId}`);
                      }
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  {(msg.sender || "?").charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <div className="message-user">
                  {profiles[msg.sender]?.display_name || "Unknown"}
                </div>
                <div className="message-text">
                  {msg.content.text}
                </div>
                {msg.content?.attachments?.map((attachment: any, i: number) => {
                  const dataUrl =
                    attachment.dataUrl ||
                    `data:${attachment.mimeType};base64,${attachment.data}`;

                  return (
                    <div key={i} className="media-container">
                      {attachment.mimeType.startsWith("image/") ? (
                        <img
                          src={dataUrl}
                          alt="Attachment"
                          className="message-attachment"
                          loading="lazy"
                          onClick={() => setExpandedImage(dataUrl)}
                        />
                      ) : attachment.mimeType.startsWith("video/") ? (
                        <video
                          src={dataUrl}
                          controls
                          className="message-attachment"
                        />
                      ) : attachment.mimeType.startsWith("audio/") ? (
                        <audio
                          src={dataUrl}
                          controls
                          className="message-attachment"
                        />
                      ) : attachment.mimeType === "application/pdf" ? (
                        <div className="pdf-attachment">
                          <div className="pdf-preview">
                            <span>📄</span>
                            <div>PDF Document</div>
                          </div>
                          <a
                            href={dataUrl}
                            download={`document-${new Date(
                              msg.timestamp
                            ).getTime()}.pdf`}
                            className="pdf-download-button"
                          >
                            Download
                          </a>
                        </div>
                      ) : (
                        <div className="generic-attachment">
                          <span>{attachment.mimeType.startsWith("video/") ? "🎥" : 
                            attachment.mimeType.startsWith("audio/") ? "🎵" : "📁"}</span>
                          <div>{attachment.mimeType}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="message-time">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
        <div ref={messagesEndRef} />
      </div>

      {isMember ? (
        roomInfo ? (
          <MessageInput
            roomId={roomId}
            onSend={() => {}}
            roomInfo={roomInfo}
          />
        ) : (
          <div className="loading-room-info">Loading room information...</div>
        )
      ) : (
        <div className="join-room-container">
          <button onClick={handleJoinRoom} className="join-room-button">
            Join Room
          </button>
        </div>
      )}
    </div>
  );
};

export default Room;

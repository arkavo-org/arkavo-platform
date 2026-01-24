import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  saveMessagesToDB, 
  getMessagesFromDB, 
  clearMessagesForRoom 
} from "./indexedDBUtils";
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
  const [openMenuMessageId, setOpenMenuMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<string>("");
  const [messageActionError, setMessageActionError] = useState<string | null>(null);
  const [tdfStatus, setTdfStatus] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");
  const [roomMeta, setRoomMeta] = useState<{ name?: string; is_public?: boolean; picture?: string }>({});
  const [dmProfile, setDmProfile] = useState<{ display_name?: string; picture?: string; userId?: string } | null>(null);
  const [isMember, setIsMember] = useState(false);
  const [showRoomInfoModal, setShowRoomInfoModal] = useState(false);
  const [roomInfo, setRoomInfo] = useState<{
    name: string;
    is_public: number;
    creator?: string;
    admins?: string[];
    picture?: string;
  } | null>(null);
  const messageAreaRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  useEffect(() => {
    if (tdfClient) {
      console.log("TDF client initialized in Room:", tdfClient);
      setTdfStatus("ready");
    } else {
      console.log("No TDF client available in Room");
      setTdfStatus("unavailable");
    }
  }, [tdfClient]);

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
              display_name: data.display_name || "Unknown user",
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
  const fetchRoomMeta = useCallback(async () => {
    if (!keycloak?.token || !roomId) return;
    try {
      if (keycloak.isTokenExpired()) {
        await keycloak.updateToken(30);
      }
      const response = await fetch(
        `${import.meta.env.VITE_USERS_API_URL}/rooms/${roomId}`,
        {
          headers: {
            Authorization: `Bearer ${keycloak.token}`,
          },
        }
      );
      if (response.ok) {
        const data = await response.json();
        const hasPicture = Boolean(
          data.picture ||
          data.image ||
          data.room_image ||
          data.photo ||
          data.avatar
        );
        console.debug("Room meta fetched", {
          id: roomId,
          hasPicture,
          keys: Object.keys(data || {}),
        });
        const picture =
          data.picture ||
          data.image ||
          data.room_image ||
          data.photo ||
          data.avatar;
        setRoomMeta({ name: data.name, is_public: data.is_public, picture });
      }
    } catch (err) {
      console.error("Failed to fetch room meta", err);
    }
  }, [keycloak, roomId]);

  useEffect(() => {
    if (roomId && tdfStatus === "ready") {
      console.log(`Loading messages for room: ${roomId}`);
      setMessages([]);
      fetchMessages(); // now tdfClient is guaranteed available
      fetchRoomMeta();
    }

    return () => {
      // Cleanup when room changes
      if (roomId) {
        clearMessagesForRoom(roomId);
      }
    };
  }, [roomId, tdfStatus, fetchRoomMeta]);
  // WebSocket connection is now managed at ChatPage level
  const { ws, connectionStatus } = useWebSocket();
  const connectionStatusText: Record<
    'connecting' | 'connected' | 'disconnected' | 'error',
    string
  > = {
    connecting: "Connecting...",
    connected: "Connected",
    disconnected: "Disconnected",
    error: "Connection Error",
  };
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [roomPartner, setRoomPartner] = useState<{ displayName: string; picture?: string } | null>(null);

  useEffect(() => {
    if (!roomInfo) return;
    const picture =
      roomInfo.picture ||
      (roomInfo as any).image ||
      (roomInfo as any).room_image ||
      (roomInfo as any).photo ||
      (roomInfo as any).avatar;
    console.debug("Room info merged into meta", {
      id: roomId,
      hasPicture: Boolean(picture),
    });
    const isPublic =
      typeof roomInfo.is_public === "number"
        ? roomInfo.is_public === 1
        : roomInfo.is_public;
    setRoomMeta((prev) => ({
      name: roomInfo.name ?? prev.name,
      is_public: isPublic ?? prev.is_public,
      picture: picture ?? prev.picture,
    }));
  }, [roomInfo]);

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
      let content;
      let encrypted = false;

      if (typeof message.content === "string") {
        const trimmedContent = message.content.trim();
        if (trimmedContent.startsWith("TDF")) {
          encrypted = true;
          content = await decryptTDFMessage(trimmedContent);
        } else {
          try {
            content = JSON.parse(trimmedContent);
          } catch {
            content = { text: trimmedContent };
          }
        }
      } else {
        content = message.content;
      }

      const processedMessage = {
        ...message,
        content_uuid: message.content_uuid || content?.uuid,
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

        if (message.type === "message_edit") {
          const processedMessage = await processMessage({
            ...message,
            content: message.content,
            content_uuid: message.message_id,
          });
          setMessages((prev) =>
            prev.map((msg) => {
              const msgId = msg.content?.uuid || msg.content_uuid;
              if (msgId !== message.message_id) {
                return msg;
              }
              return {
                ...msg,
                content: processedMessage.content,
                encrypted: processedMessage.encrypted,
                content_uuid: message.message_id,
                edited_at: message.edited_at,
              };
            })
          );
          return;
        }

        if (message.type === "message_delete") {
          setMessages((prev) =>
            prev.filter((msg) => {
              const msgId = msg.content?.uuid || msg.content_uuid;
              return msgId !== message.message_id;
            })
          );
          return;
        }

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

  useEffect(() => {
    // For DM rooms, infer the other participant
    if (!roomId?.includes("_") || !keycloak?.tokenParsed?.sub) {
      setRoomPartner(null);
      return;
    }
    const [a, b] = roomId.split("_");
    const otherId = a === keycloak.tokenParsed.sub ? b : a;
    if (!otherId) return;
    const existing = profiles[otherId];
    if (existing) {
      setRoomPartner({
        displayName: existing.display_name,
        picture: existing.picture,
      });
    } else {
      fetchProfile(otherId).then(() => {
        const next = profiles[otherId];
        if (next) {
          setRoomPartner({
            displayName: next.display_name,
            picture: next.picture,
          });
        }
      });
    }
  }, [roomId, keycloak?.tokenParsed?.sub, profiles, fetchProfile]);

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
        const hasPicture = Boolean(
          data.picture ||
          (data as any).image ||
          (data as any).room_image ||
          (data as any).photo ||
          (data as any).avatar
        );
        console.debug("Room info fetched", {
          id: roomId,
          hasPicture,
          keys: Object.keys(data || {}),
        });
        setRoomInfo(data);
      } else {
        console.error("Failed to fetch room info:", response.status);
      }
    } catch (error) {
      console.error("Error fetching room info:", error);
    }
  };

  const openRoomInfo = async () => {
    await fetchRoomInfo();
    setShowRoomInfoModal(true);
  };

  const handleRoomUpdated = async () => {
    await fetchRoomInfo();
  };

  const buildMessagePayload = async (
    text: string,
    attachments: Array<{ data: string; mimeType: string }> | undefined,
    messageId: string
  ) => {
    const contentDict: any = {
      uuid: messageId,
      text,
      ...(attachments && attachments.length > 0 && { attachments }),
    };
    const contentString = JSON.stringify(contentDict);
    if (roomInfo?.is_public) {
      return contentString;
    }
    if (!tdfClient) {
      throw new Error("Encryption unavailable");
    }
    const encryptedBuffer = await tdfClient.encrypt(contentString);
    const binary = Array.from(new Uint8Array(encryptedBuffer))
      .map((byte) => String.fromCharCode(byte))
      .join("");
    return btoa(binary);
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

  useEffect(() => {
    const handleDocumentClick = () => {
      setOpenMenuMessageId(null);
    };
    document.addEventListener("click", handleDocumentClick);
    return () => {
      document.removeEventListener("click", handleDocumentClick);
    };
  }, []);

  const getMessageId = (msg: any) =>
    msg?.content?.uuid || msg?.content_uuid || null;

  const handleStartEdit = (msg: any) => {
    const messageId = getMessageId(msg);
    if (!messageId) return;
    setEditingMessageId(messageId);
    setEditDraft(msg?.content?.text || "");
    setOpenMenuMessageId(null);
    setMessageActionError(null);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditDraft("");
  };

  const handleSaveEdit = async (msg: any) => {
    const messageId = getMessageId(msg);
    if (!messageId || !keycloak?.token) return;
    if (!roomInfo) {
      setMessageActionError("Room info not loaded.");
      return;
    }
    setMessageActionError(null);
    const attachments = Array.isArray(msg?.content?.attachments)
      ? msg.content.attachments.map((att: any) => ({
          data: att.data,
          mimeType: att.mimeType,
        }))
      : undefined;
    try {
      if (keycloak.isTokenExpired()) {
        await keycloak.updateToken(30);
      }
      const contentPayload = await buildMessagePayload(
        editDraft,
        attachments,
        messageId
      );
      const response = await fetch(
        `${import.meta.env.VITE_USERS_API_URL}/rooms/${roomId}/messages/${messageId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${keycloak.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content: contentPayload }),
        }
      );
      if (!response.ok) {
        throw new Error("Failed to update message");
      }
      setMessages((prev) =>
        prev.map((item) => {
          const itemId = getMessageId(item);
          if (itemId !== messageId) {
            return item;
          }
          return {
            ...item,
            content: {
              ...item.content,
              text: editDraft,
              uuid: messageId,
              ...(attachments ? { attachments } : {}),
            },
            content_uuid: messageId,
            edited_at: new Date().toISOString(),
          };
        })
      );
      setEditingMessageId(null);
      setEditDraft("");
    } catch (error) {
      console.error("Failed to edit message:", error);
      setMessageActionError("Could not edit this message.");
    }
  };

  const handleDeleteMessage = async (msg: any) => {
    const messageId = getMessageId(msg);
    if (!messageId || !keycloak?.token) return;
    const confirmed = window.confirm("Delete this message?");
    if (!confirmed) return;
    setMessageActionError(null);
    try {
      if (keycloak.isTokenExpired()) {
        await keycloak.updateToken(30);
      }
      const response = await fetch(
        `${import.meta.env.VITE_USERS_API_URL}/rooms/${roomId}/messages/${messageId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${keycloak.token}`,
          },
        }
      );
      if (!response.ok) {
        throw new Error("Failed to delete message");
      }
      setMessages((prev) =>
        prev.filter((item) => getMessageId(item) !== messageId)
      );
      if (editingMessageId === messageId) {
        handleCancelEdit();
      }
    } catch (error) {
      console.error("Failed to delete message:", error);
      setMessageActionError("Could not delete this message.");
    }
  };

  const handleReportMessage = async (msg: any) => {
    const messageId = getMessageId(msg);
    if (!messageId || !keycloak?.token || !msg?.sender) return;
    const reason = window.prompt("Report reason (optional):");
    if (reason === null) return;
    setMessageActionError(null);
    try {
      if (keycloak.isTokenExpired()) {
        await keycloak.updateToken(30);
      }
      const response = await fetch(
        `${import.meta.env.VITE_USERS_API_URL}/users/${msg.sender}/report`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${keycloak.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            room_id: roomId,
            reason: reason || "",
            message_id: messageId,
          }),
        }
      );
      if (!response.ok) {
        throw new Error("Failed to report message");
      }
      setMessageActionError("Report submitted.");
    } catch (error) {
      console.error("Failed to report message:", error);
      setMessageActionError("Could not submit report.");
    }
  };

  // Load room info when roomId or authentication changes
  useEffect(() => {
    if (keycloak?.authenticated) {
      fetchRoomInfo();
    }
  }, [roomId, keycloak?.authenticated]);

  const scrollToBottom = useCallback(() => {
    if (!shouldAutoScrollRef.current) return;
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  const handleMessageAreaScroll = useCallback(() => {
    const area = messageAreaRef.current;
    if (!area) return;
    const distanceFromBottom =
      area.scrollHeight - area.scrollTop - area.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 80;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, roomId, scrollToBottom]);

  useEffect(() => {
    shouldAutoScrollRef.current = true;
  }, [roomId]);

  return (
    <div className="room-content">
      <div className="room-mobile-header">
        <div
          className="room-chip"
          role="button"
          tabIndex={0}
          onClick={openRoomInfo}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openRoomInfo();
            }
          }}
          aria-label="Room information"
        >
          <div className="chip-avatar">
            {(() => {
              const avatarImage = roomId.includes("_")
                ? roomPartner?.picture
                : roomInfo?.picture ||
                  (roomInfo as any)?.image ||
                  (roomInfo as any)?.room_image ||
                  (roomInfo as any)?.photo ||
                  (roomInfo as any)?.avatar ||
                  roomMeta.picture;

              if (avatarImage) {
                const src = avatarImage.startsWith("data:")
                  ? avatarImage
                  : `data:image/jpeg;base64,${avatarImage}`;
                return <img src={src} alt={roomMeta.name || roomId} />;
              }

              const fallbackText = roomId.includes("_")
                ? (roomPartner?.displayName || roomId).charAt(0).toUpperCase()
                : (roomInfo?.name || roomMeta.name || roomId).charAt(0).toUpperCase();
              return <span>{fallbackText}</span>;
            })()}
          </div>
          <div className="chip-text">
            <div className="chip-title">
              {roomId.includes("_")
                ? roomPartner?.displayName || roomId
                : roomInfo?.name || roomMeta.name || roomId}
            </div>
            <div className="chip-sub">
              {roomId.includes("_")
                ? "Direct Message"
                : (roomInfo?.is_public ?? roomMeta.is_public)
                ? "Public room"
                : "Private room"}
            </div>
          </div>
        </div>
      </div>
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

      <div
        className="message-area"
        ref={messageAreaRef}
        onScroll={handleMessageAreaScroll}
      >
        {messages
          .sort(
            (a, b) =>
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          )
          .map((msg, index) => (
            <div key={index} className={`message-item ${msg.encrypted ? "decrypted" : ""}`}>
              {(() => {
                const messageId = getMessageId(msg);
                const isOwn = msg.sender === keycloak?.tokenParsed?.sub;
                if (!messageId) return null;
                return (
                  <div className="message-menu-wrapper">
                    <button
                      type="button"
                      className="message-menu-button"
                      aria-label="Message actions"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuMessageId((prev) =>
                          prev === messageId ? null : messageId
                        );
                        setMessageActionError(null);
                      }}
                    >
                      ⋯
                    </button>
                    {openMenuMessageId === messageId && (
                      <div
                        className="message-menu"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {isOwn ? (
                          <>
                            <button
                              type="button"
                              className="message-menu-item"
                              onClick={() => handleStartEdit(msg)}
                            >
                              Edit message
                            </button>
                            <button
                              type="button"
                              className="message-menu-item danger"
                              onClick={() => handleDeleteMessage(msg)}
                            >
                              Delete message
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="message-menu-item danger"
                            onClick={() => handleReportMessage(msg)}
                          >
                            Report message
                          </button>
                        )}
                        {messageActionError && (
                          <div className="message-menu-status">
                            {messageActionError}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
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
                  {(
                    profiles[msg.sender]?.display_name?.charAt(0) || "?"
                  ).toUpperCase()}
                </div>
              )}
              <div>
                <div className="message-user">
                  {profiles[msg.sender]?.display_name || "Unknown"}
                </div>
                {(() => {
                  const messageId = getMessageId(msg);
                  if (messageId && editingMessageId === messageId) {
                    return (
                      <div className="message-edit">
                        <textarea
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                        />
                        <div className="message-edit-actions">
                          <button
                            type="button"
                            className="message-edit-save"
                            onClick={() => handleSaveEdit(msg)}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="message-edit-cancel"
                            onClick={handleCancelEdit}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    );
                  }
                  return <div className="message-text">{msg.content.text}</div>;
                })()}
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
          <div className="chat-input-wrapper">
            <MessageInput
              roomId={roomId}
              onSend={() => {}}
              roomInfo={roomInfo}
            />
          </div>
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

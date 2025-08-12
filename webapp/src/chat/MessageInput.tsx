import React, { useRef, useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import "./MessageInput.css";
import type { NanoTDFDatasetClient } from "@opentdf/sdk";

interface Attachment {
  data: string; // base64 encoded
  mimeType: string;
}

interface MessageInputProps {
  roomId: string;
  onSend: () => void;
  roomInfo?: {
    name: string;
    is_public: number;
    creator?: string;
    admins?: string[];
  } | null;
}

const MessageInput: React.FC<MessageInputProps> = ({
  roomId,
  onSend,
  roomInfo,
}): JSX.Element => {
  const { keycloak, tdfClient } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [message_text, setNewMessage] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  useEffect(() => {
    if (tdfClient) {
      console.log("TDF client initialized in MessageInput:", tdfClient);
    } else {
      console.log("No TDF client available in MessageInput");
    }
  }, [tdfClient]);

  const detectFileType = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const arr = new Uint8Array(e.target?.result as ArrayBuffer).subarray(
          0,
          4
        );
        let header = "";
        for (let i = 0; i < arr.length; i++) {
          header += arr[i].toString(16);
        }

        // Check known file signatures
        switch (header) {
          case "89504e47":
            resolve("image/png");
            break;
          case "47494638":
            resolve("image/gif");
            break;
          case "ffd8ffe0":
          case "ffd8ffe1":
          case "ffd8ffe2":
          case "ffd8ffe3":
          case "ffd8ffe8":
            resolve("image/jpeg");
            break;
          case "66747970":
            resolve("video/mp4");
            break;
          case "1a45dfa3":
            resolve("video/webm");
            break;
          case "25504446":
            resolve("application/pdf");
            break; // PDF magic number
          case "49443303":
          case "49443304":
            resolve("audio/mpeg"); // MP3
            break;
          case "4f676753":
            resolve("audio/ogg");
            break;
          case "664c6143":
            resolve("audio/flac");
            break;
          case "52494646":
            resolve("audio/wav");
            break;
          default:
            resolve(file.type || "application/octet-stream");
        }
      };
      reader.readAsArrayBuffer(file.slice(0, 4));
    });
  };

  const handleSendMessage = async () => {
    if (!message_text.trim() && selectedFiles.length === 0) return;

    try {
      // Validate keycloak and token
      if (!keycloak) {
        throw new Error("Authentication not available - please log in");
      }
      if (!roomInfo?.is_public && !tdfClient) {
        throw new Error("TDF client not initialized - cannot send messages");
      }
      if (!keycloak.tokenParsed?.sub) {
        throw new Error("Invalid authentication token - missing user ID");
      }

      // Refresh token if needed
      if (keycloak.isTokenExpired()) {
        await keycloak.updateToken(30);
      }

      // Process attachments
      const attachments = await Promise.all(
        selectedFiles.map(async (file) => {
          const detectedType = await detectFileType(file);
          const base64Data = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve((reader.result as string).split(",")[1]);
            reader.readAsDataURL(file);
          });

          return {
            data: base64Data,
            mimeType: detectedType,
          };
        })
      );

      const messageId = crypto.randomUUID();
      let content_dict = {
        uuid: messageId,
        text: message_text,
        ...(attachments.length > 0 && { attachments }),
      };

      // Ensure roomInfo is loaded
      if (!roomInfo) {
        console.error(
          "Room info not available - cannot determine encryption status"
        );
        throw new Error("Room information not available");
      }
      let message;
      let content_string = JSON.stringify(content_dict);
      // Encrypt entire message as JSON if room is private
      if (!roomInfo.is_public && tdfClient) {
        console.log("Starting encryption for private room...");
        console.log("Original message:", content_dict);

        const encryptedBuffer = await tdfClient.encrypt(content_string);
        function arrayBufferToBase64(buffer: ArrayBuffer) {
          const binary = Array.from(new Uint8Array(buffer))
            .map((byte) => String.fromCharCode(byte))
            .join("");
          return btoa(binary);
        }

        message = arrayBufferToBase64(encryptedBuffer);

        console.log("Encrypted message as JSON");
      } else {
        console.log("Sending unencrypted message");
        message = JSON.stringify(content_dict);
      }

      const response = await fetch(
        `${import.meta.env.VITE_USERS_API_URL}/rooms/${roomId}/message`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${keycloak?.token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ content: message }),
        }
      );

      if (response.ok) {
        setNewMessage("");
        setSelectedFiles([]);
        onSend();
      } else {
        console.error("Failed to send message:", response.status);
      }
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
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
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        setSelectedFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
      }
    };

  return (
    <div className="message-input">
      <div
        className="message-input-container"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <textarea
          value={message_text}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="Type a message or drag files here..."
          className="message-textarea"
        />
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="*"
        onChange={handleFileChange}
        className="hidden-file-input"
        multiple
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        className="add-files-button"
        title="Attach files"
      >
        📎
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
              {file.type.startsWith("image/") ? (
                <img
                  src={URL.createObjectURL(file)}
                  alt="Preview"
                  className="image-preview"
                />
              ) : (
                <div className="generic-preview-placeholder">
                  <span>
                    {file.type.startsWith("video/") ? "🎥" : 
                    file.type.startsWith("audio/") ? "🎵" :
                    file.type === "application/pdf" ? "📄" : "📁"}
                  </span>
                  <div className="file-name">{file.name}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <button onClick={handleSendMessage} className="send-button">
        Send
      </button>
    </div>
  );
};

export default MessageInput;

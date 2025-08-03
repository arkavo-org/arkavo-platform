import React, { useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import './MessageInput.css';

interface MessageInputProps {
  roomId: string;
  onSend: () => void;
}

const MessageInput: React.FC<MessageInputProps> = ({ roomId, onSend }) => {
  const { keycloak } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newMessage, setNewMessage] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

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
          case '25504446': resolve('application/pdf'); break; // PDF magic number
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
        setSelectedFiles([]);
        onSend();
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
        file.type.startsWith('image/') || 
        file.type.startsWith('video/') ||
        file.type === 'application/pdf'
      );
      if (files.length > 0) {
        setSelectedFiles(prev => [...prev, ...files]);
      }
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
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="Type a message or drag files here..."
          className="message-textarea"
        />
      </div>
      <input 
        ref={fileInputRef}
        type="file" 
        accept="image/*,video/*,application/pdf" 
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
              {file.type.startsWith('image/') ? (
                <img 
                  src={URL.createObjectURL(file)} 
                  alt="Preview" 
                  className="image-preview"
                />
              ) : file.type.startsWith('video/') ? (
                <div className="video-preview-placeholder">
                  <span>🎥</span>
                </div>
              ) : (
                <div className="pdf-preview-placeholder">
                  <span>📄</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <button onClick={handleSendMessage} className="send-button">Send</button>
    </div>
  );
};

export default MessageInput;

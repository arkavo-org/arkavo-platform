import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import '../css/ChatPage.css';
import Room from './Room';
import ExploreRooms from './ExploreRooms';

interface ChatPageProps {}

const ChatPage: React.FC<ChatPageProps> = () => {
  const navigate = useNavigate();
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [showExplore, setShowExplore] = useState(false);

  // Authentication is now handled by ReactKeycloakProvider in App.tsx
  // No need for separate initialization here

  const handleRoomSelect = (roomId: string) => {
    setActiveRoom(roomId);
    setShowExplore(false);
  };

  const handleCreateRoom = () => {
    navigate('/create-room');
  };

  return (
    <div className="chat-page">
      <div className="sidebar">
        <h2>Chat Rooms</h2>
        <button className="add-room" onClick={() => setShowExplore(true)}>Explore Rooms</button>
        <button className="add-room" onClick={handleCreateRoom}>Create Room</button>
      </div>
      
      <div className="chat-area">
        {showExplore ? (
          <ExploreRooms onRoomSelect={handleRoomSelect} />
        ) : activeRoom ? (
          <Room roomId={activeRoom} />
        ) : (
          <div className="select-room">
            <h3>Select a room to start chatting</h3>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatPage;

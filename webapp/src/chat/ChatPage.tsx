import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "../css/ChatPage.css";
import Room from "./Room";
import ExploreRooms from "./ExploreRooms";

interface Room {
  id: string;
  name: string;
  is_public: boolean;
}

interface ChatPageProps {}

const ChatPage: React.FC<ChatPageProps> = () => {
  const navigate = useNavigate();
  const { isAuthenticated, keycloak } = useAuth();
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [showExplore, setShowExplore] = useState(false);
  const [userRooms, setUserRooms] = useState<Room[]>([]);

  useEffect(() => {
    const fetchUserRooms = async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_USERS_API_URL}/user/rooms`,
          {
            headers: {
              Authorization: `Bearer ${keycloak?.token}`,
            },
          }
        );
        if (response.ok) {
          const data = await response.json();
          setUserRooms(data.rooms);
        }
      } catch (error) {
        console.error("Failed to fetch user rooms:", error);
      }
    };

    if (isAuthenticated && keycloak?.token) {
      fetchUserRooms();
    }
  }, [isAuthenticated, keycloak?.token]);

  const handleRoomSelect = (roomId: string) => {
    setActiveRoom(roomId);
    setShowExplore(false);
  };

  const handleCreateRoom = () => {
    navigate("/create-room");
  };

  return (
    <div className="chat-page">
      <div className="sidebar">
        <h2>Chat Rooms</h2>
        <div className="room-list">
          {userRooms.map((room) => (
            <div
              key={room.id}
              className={`room-item ${activeRoom === room.id ? "active" : ""}`}
              onClick={() => handleRoomSelect(room.id)}
            >
              {room.name}
            </div>
          ))}
        </div>
        <div className="room-actions">
          <button className="add-room" onClick={() => setShowExplore(true)}>
            Explore Rooms
          </button>
          <button className="add-room" onClick={handleCreateRoom}>
            Create Room
          </button>
        </div>
      </div>

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
  );
};

export default ChatPage;

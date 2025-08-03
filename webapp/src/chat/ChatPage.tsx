import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "../css/global.css";
import "../css/ChatPage.css";
import Room from "./Room";
import ExploreRooms from "./ExploreRooms";

function getOtherUserId(roomId: string, currentUserId: string): string {
  const [id1, id2] = roomId.split('_');
  return id1 === currentUserId ? id2 : id1;
}

interface Room {
  id: string;
  name: string;
  is_public: boolean;
}

interface ChatPageProps {}

const ChatPage: React.FC<ChatPageProps> = () => {
  const navigate = useNavigate();
  const { isAuthenticated, keycloak } = useAuth();
  const { roomId: urlRoomId } = useParams();
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [showExplore, setShowExplore] = useState(false);
  const [userRooms, setUserRooms] = useState<Room[]>([]);
  const [displayNames, setDisplayNames] = useState<Record<string, string>>({});

  useEffect(() => {
    // Always sync activeRoom with URL
    if (urlRoomId) {
      setActiveRoom(urlRoomId);
    } else {
      setActiveRoom(null);
    }
  }, [urlRoomId]);

  useEffect(() => {
    // Update URL when activeRoom changes (except initial load)
    if (activeRoom && activeRoom !== urlRoomId) {
      navigate(`/chat/${activeRoom}`, { replace: true });
    }
  }, [activeRoom]);

  useEffect(() => {
    const fetchUserRooms = async () => {
      try {
        // Refresh token if needed
        if (keycloak?.isTokenExpired()) {
          await keycloak.updateToken(30);
        }

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

          // Pre-fetch display names for DM rooms
          if (keycloak?.tokenParsed?.sub) {
            const currentUserId = keycloak.tokenParsed.sub;
            const dmRooms = data.rooms.filter((room: Room) => room.id.includes('_'));
            const displayNamePromises = dmRooms.map(async (room: Room) => {
              const otherUserId = getOtherUserId(room.id, currentUserId);
              const name = await fetchDisplayName(otherUserId);
              return { otherUserId, name };
            });

            const displayNameResults = await Promise.all(displayNamePromises);
            const newDisplayNames = displayNameResults.reduce((acc, { otherUserId, name }) => {
              acc[otherUserId] = name;
              return acc;
            }, {} as Record<string, string>);

            setDisplayNames(prev => ({ ...prev, ...newDisplayNames }));
          }
        }
      } catch (error) {
        console.error("Failed to fetch user rooms:", error);
      }
    };

    if (isAuthenticated && keycloak?.token) {
      fetchUserRooms();
    }
  }, [isAuthenticated, keycloak?.token]);

  const fetchDisplayName = async (userId: string): Promise<string> => {
    if (!keycloak?.token) return userId;

    try {
      if (keycloak.isTokenExpired()) {
        await keycloak.updateToken(30);
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
        return data.display_name || userId;
      }
    } catch (error) {
      console.error("Failed to fetch display name:", error);
    }
    return userId;
  };

  const handleRoomSelect = async (roomId: string) => {
    if (roomId !== activeRoom) {
      setActiveRoom(roomId);
      setShowExplore(false);
      // URL update will be handled by the effect above

      if (roomId.includes('_') && keycloak?.tokenParsed?.sub) {
        const otherUserId = getOtherUserId(roomId, keycloak.tokenParsed.sub);
        const name = await fetchDisplayName(otherUserId);
        setDisplayNames(prev => ({ ...prev, [otherUserId]: name }));
      }
    }
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
              {room.id.includes("_") && keycloak?.tokenParsed?.sub ? 
                displayNames[getOtherUserId(room.id, keycloak.tokenParsed.sub)] || "Loading..."
                : room.name}
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

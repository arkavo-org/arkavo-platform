import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import '../css/ExploreRooms.css';

interface Room {
  id: string;
  name: string;
  is_public: boolean;
}

interface ExploreRoomsProps {
  onRoomSelect: (roomId: string) => void;
}

const ExploreRooms: React.FC<ExploreRoomsProps> = ({ onRoomSelect }) => {
  const { keycloak, isAuthenticated } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_USERS_API_URL}/rooms`, {
          headers: {
            Authorization: `Bearer ${keycloak?.token}`
          }
        });
        
        if (response.ok) {
          const rooms = await response.json();
          console.log('Fetched rooms:', rooms);
          const publicRooms = Array.isArray(rooms) ? rooms.filter((room: Room) => room.is_public) : [];
          setRooms(publicRooms);
        } else {
          console.error('Failed to fetch rooms:', response.status, response.statusText);
        }
      } catch (error) {
        console.error('Error fetching rooms:', error);
      } finally {
        setLoading(false);
      }
    };

    if (isAuthenticated && keycloak?.token) {
      fetchRooms();
    }
  }, [isAuthenticated, keycloak?.token]);

  const handleJoinRoom = async (roomId: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_USERS_API_URL}/rooms/${roomId}/join`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${keycloak?.token}`
        }
      });

      if (response.ok) {
        onRoomSelect(roomId);
      }
    } catch (error) {
      console.error('Error joining room:', error);
    }
  };

  if (loading) {
    return <div>Loading rooms...</div>;
  }

  return (
    <div className="chat-area">
      <h3>Available Rooms</h3>
      <div className="rooms-list">
        {rooms?.map(room => (
          <div key={room.id} className="room-item" onClick={() => handleJoinRoom(room.id)}>
            <div className="room-avatar">{room.name.charAt(0).toUpperCase()}</div>
            <div>
              <h4>{room.name}</h4>
              <span>{room.is_public ? 'Public' : 'Private'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ExploreRooms;

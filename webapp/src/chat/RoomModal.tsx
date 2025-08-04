import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

interface RoomModalProps {
  roomId: string;
  roomInfo: {
    name: string;
    is_public: number;
    creator?: string;
    admins?: string[];
  } | null;
  profiles: {[key: string]: {display_name: string, picture: string}};
  onClose: () => void;
  onRoomUpdated: () => void;
}

const RoomModal: React.FC<RoomModalProps> = ({
  roomId,
  roomInfo,
  profiles,
  onClose,
  onRoomUpdated
}) => {
  const { keycloak } = useAuth();
  const [editedRoomInfo, setEditedRoomInfo] = useState({
    name: roomInfo?.name || '',
    is_public: roomInfo?.is_public || 0
  });

  const handleEditChange = (field: string, value: string | number | boolean) => {
    const newValue = field === 'is_public' ? (value ? 1 : 0) : value;
    setEditedRoomInfo(prev => ({
      ...prev,
      [field]: newValue
    }));
  };

  const handleSave = async () => {
    if (!roomInfo || !keycloak?.token) return;

    try {
      if (keycloak.isTokenExpired()) {
        await keycloak.updateToken(30);
      }

      const response = await fetch(
        `${import.meta.env.VITE_USERS_API_URL}/rooms/${roomId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${keycloak.token}`,
          },
          body: JSON.stringify(editedRoomInfo),
        }
      );

      if (response.ok) {
        onRoomUpdated();
      }
    } catch (error) {
      console.error("Error updating room:", error);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="room-info-modal"
        onClick={e => e.stopPropagation()}
      >
        <h2>Room Information</h2>
        {roomInfo?.admins?.includes(keycloak?.tokenParsed?.sub || '') ? (
          <>
            <div className="room-edit-field">
              <label>Name:</label>
              <input
                type="text"
                value={editedRoomInfo.name || ''}
                onChange={(e) => handleEditChange('name', e.target.value)}
                onBlur={handleSave}
              />
            </div>
            <div className="room-edit-field">
              <label>
                <input
                  type="checkbox"
                  checked={!!editedRoomInfo.is_public}
                  onChange={(e) => handleEditChange('is_public', e.target.checked)}
                />
                Public Room
              </label>
            </div>
            <div className="room-edit-actions">
              <button onClick={handleSave}>Save Changes</button>
            </div>
          </>
        ) : (
          <>
            <p><strong>Name:</strong> {roomInfo?.name}</p>
            <p><strong>Type:</strong> {roomInfo?.is_public ? 'Public' : 'Private'}</p>
            {roomInfo?.creator && (
              <p><strong>Created by:</strong> {roomInfo.creator}</p>
            )}
            <div className="admins-section">
              <h3>Admins</h3>
              <ul>
                {roomInfo?.admins?.map(adminId => (
                  <li key={adminId}>
                    {profiles[adminId]?.display_name || adminId}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
        <button 
          className="room-info-modal-button"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default RoomModal;

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

interface RoomModalProps {
  roomId: string;
  roomInfo: {
    name: string;
    isPublic: boolean;
    creator?: string;
    admins?: string[];
  } | null;
  editedRoomInfo: {
    name: string;
    isPublic: boolean;
  };
  isEditingRoom: boolean;
  profiles: {[key: string]: {display_name: string, picture: string}};
  onClose: () => void;
  onSave: () => void;
  onEditChange: (field: string, value: string | boolean) => void;
  onToggleEdit: () => void;
}

const RoomModal: React.FC<RoomModalProps> = ({
  roomId,
  roomInfo,
  editedRoomInfo,
  isEditingRoom,
  profiles,
  onClose,
  onSave,
  onEditChange,
  onToggleEdit
}) => {
  const { keycloak } = useAuth();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="room-info-modal"
        onClick={e => e.stopPropagation()}
      >
        <h2>Room Information</h2>
        {isEditingRoom ? (
          <>
            <div className="room-edit-field">
              <label>Name:</label>
              <input
                type="text"
                value={editedRoomInfo.name || ''}
                onChange={(e) => onEditChange('name', e.target.value)}
              />
            </div>
            <div className="room-edit-field">
              <label>
                <input
                  type="checkbox"
                  checked={editedRoomInfo.isPublic || false}
                  onChange={(e) => onEditChange('isPublic', e.target.checked)}
                />
                Public Room
              </label>
            </div>
            <div className="room-edit-actions">
              <button onClick={onSave}>Save Changes</button>
              <button onClick={onToggleEdit}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <p><strong>Name:</strong> {roomInfo?.name}</p>
            <p><strong>Type:</strong> {roomInfo?.isPublic ? 'Public' : 'Private'}</p>
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
            {roomInfo?.admins?.includes(keycloak?.tokenParsed?.sub || '') && (
              <button onClick={onToggleEdit}>Edit Room</button>
            )}
            <button 
              className="room-info-modal-button"
              onClick={onClose}
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default RoomModal;

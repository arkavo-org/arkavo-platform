import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../css/CreateRoom.css';

const CreateRoom: React.FC = () => {
    const navigate = useNavigate();
    const { keycloak } = useAuth();
    const [roomName, setRoomName] = useState('');
    const [isPublic, setIsPublic] = useState(true);
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleCreateRoom = async (e: React.FormEvent) => {
        console.log('Creating room with name:', roomName, 'Public:', isPublic);
        e.preventDefault();
        
        if (!roomName.trim()) {
            setError('Room name is required');
            return;
        }

        try {
            setIsSubmitting(true);
            const response = await fetch(`${import.meta.env.VITE_USERS_API_URL}/rooms`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${keycloak?.token}`
                },
                body: JSON.stringify({
                    name: roomName.trim(),
                    is_public: isPublic
                })
            });
    
            console.log('Response status:', response.status);
            if (response.ok) {
                const data = await response.json();
                navigate(`/chat/${data.id}`);
            } else {
                setError('Failed to create room');
            }
        } catch (err) {
            console.error('Create room failed:', err);
            setError('Something went wrong while creating the room.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleExit = () => {
        // Navigate to the home page or any other route
        navigate('/chat');
    };

    return (
        <div className="create-room-page">
            <div className="create-room-card">
                <div className="create-room-header">
                    <div className="header-icon">🗨️</div>
                    <div>
                        <p className="section-eyebrow">Create Room</p>
                        <h2>Create Room</h2>
                    </div>
                </div>

                {error && <div className="error-message">{error}</div>}

                <form className="create-room-form" onSubmit={handleCreateRoom}>
                    <label htmlFor="room-name">Room name</label>
                    <div className="input-field">
                        <input
                            id="room-name"
                            type="text"
                            value={roomName}
                            onChange={(e) => setRoomName(e.target.value)}
                            placeholder="e.g., War Room, Design Huddle, Incident #592"
                            maxLength={80}
                            required
                        />
                        <span className="input-hint">
                            {80 - roomName.length} characters remaining
                        </span>
                    </div>

                    <label>Visibility</label>
                    <div className="room-visibility-toggle" role="group" aria-label="Room visibility">
                        <button
                            type="button"
                            className={`toggle-option ${isPublic ? 'active' : ''}`}
                            onClick={() => setIsPublic(true)}
                        >
                            <span className="option-title">Public</span>
                            <span className="option-caption">Anyone can find and join</span>
                        </button>
                        <button
                            type="button"
                            className={`toggle-option ${!isPublic ? 'active' : ''}`}
                            onClick={() => setIsPublic(false)}
                        >
                            <span className="option-title">Private</span>
                            <span className="option-caption">Only invited members</span>
                        </button>
                    </div>

                    <p className="helper-text">
                        {isPublic
                            ? 'Public rooms are discoverable in Explore Rooms and anyone can hop in.'
                            : 'Private rooms stay hidden. Share the link or invite members manually.'}
                    </p>

                    <div className="form-actions">
                        <button
                            type="button"
                            className="ghost-button"
                            onClick={handleExit}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="primary-button"
                            disabled={!roomName.trim() || isSubmitting}
                        >
                            {isSubmitting ? 'Creating...' : 'Create Room'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CreateRoom;

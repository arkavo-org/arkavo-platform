import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useKeycloak } from '@react-keycloak/web';
import '../css/ChatPage.css';

const CreateRoom: React.FC = () => {
    const navigate = useNavigate();
    const { keycloak } = useKeycloak();
    const [roomName, setRoomName] = useState('');
    const [isPublic, setIsPublic] = useState(true);
    const [error, setError] = useState('');

    const handleCreateRoom = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!roomName.trim()) {
            setError('Room name is required');
            return;
        }

        try {
            const response = await fetch(`${import.meta.env.VITE_USERS_API_URL}/rooms`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${keycloak.token}`
                },
                body: JSON.stringify({
                    name: roomName,
                    isPublic: isPublic
                })
            });

            if (response.ok) {
                const data = await response.json();
                navigate(`/room/${data.room_id}`);
            } else {
                setError('Failed to create room');
            }
        } catch (error) {
            console.error("Error creating room:", error);
            setError("Failed to create room. Please try again.");
        }
    };

    const handleExit = () => {
        // Navigate to the home page or any other route
        navigate('/chat');
    };

    return (
        <div className="create-room-container">
            <h2>Create a Room</h2>
            {error && <div className="error-message">{error}</div>}
            <form onSubmit={handleCreateRoom}>
                <label>
                    Room Name:
                    <input
                        type="text"
                        value={roomName}
                        onChange={(e) => setRoomName(e.target.value)}
                        required
                    />
                </label>
                <label className="room-visibility">
                    <input
                        type="checkbox"
                        checked={isPublic}
                        onChange={(e) => setIsPublic(e.target.checked)}
                    />
                    Public Room
                </label>
                <button type="submit">Create Room</button>
                <button type="button" onClick={handleExit} className="exit-button">
                    Exit
                </button>
            </form>
        </div>
    );
};

export default CreateRoom;

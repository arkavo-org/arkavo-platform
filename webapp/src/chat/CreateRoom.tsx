import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../css/ChatPage.css';

const CreateRoom: React.FC = () => {
    const navigate = useNavigate();
    const { keycloak } = useAuth();
    const [roomName, setRoomName] = useState('');
    const [isPublic, setIsPublic] = useState(true);
    const [error, setError] = useState('');

    const handleCreateRoom = async (e: React.FormEvent) => {
        console.log('Creating room with name:', roomName, 'Public:', isPublic);
        e.preventDefault();
        
        if (!roomName.trim()) {
            setError('Room name is required');
            return;
        }

        const response = await fetch(`${import.meta.env.VITE_USERS_API_URL}/rooms`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${keycloak?.token}`
            },
            body: JSON.stringify({
                name: roomName,
                isPublic: isPublic
            })
        });

        console.log('Response status:', response.status);
        if (response.ok) {
            const data = await response.json();
            navigate(`/chat?roomid=${data.room_id}`);
        } else {
            setError('Failed to create room');
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

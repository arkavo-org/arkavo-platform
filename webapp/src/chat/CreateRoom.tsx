import React, { useState } from 'react';
import '../css/CreateRoom.css';
import { useNavigate } from 'react-router-dom';
import { fetchRooms, fetchPublicRooms, joinRoom } from './Utils'; // Import joinRoom function

const CreateRoom: React.FC = () => {
    const navigate = useNavigate();
    const [roomName, setRoomName] = useState('');
    const [roomTopic, setRoomTopic] = useState('');
    const [roomVisibility, setRoomVisibility] = useState('private_chat');
    const [error, setError] = useState<string | null>(null);

    const handleCreateRoom = async (e: React.FormEvent) => {
        e.preventDefault(); // Prevent default form submission behavior

        const synapseBaseUrl = import.meta.env.VITE_SYNAPSE_BASE_URL;

        const accessToken = localStorage.getItem('matrixAccessToken');
        if (!accessToken) {
            setError("Authentication token not found. Please log in again.");
            return;
        }

        const requestBody = {
            name: roomName,
            topic: roomTopic,
            preset: roomVisibility, // "private_chat" or "public_chat"
        };

        try {
            const response = await fetch(`https://${synapseBaseUrl}/_matrix/client/v3/createRoom`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                throw new Error(`Failed to create room: ${response.statusText}`);
            }

            const data = await response.json();
            console.log("Room created:", data);

            // Redirect to the chat page
            navigate('/chat');
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
                <label>
                    Room Topic:
                    <input
                        type="text"
                        value={roomTopic}
                        onChange={(e) => setRoomTopic(e.target.value)}
                    />
                </label>
                <label>
                    Room Visibility:
                    <select
                        value={roomVisibility}
                        onChange={(e) => setRoomVisibility(e.target.value)}
                    >
                        <option value="public_chat">Public</option>
                        <option value="private_chat">Private</option>
                    </select>
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
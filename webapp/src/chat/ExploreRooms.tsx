import React, { useState, useEffect } from 'react';
import '../css/ExploreRooms.css';
import { useNavigate } from 'react-router-dom';
import { useKeycloak } from '@react-keycloak/web';
import { handleLogin } from './ChatAuth';
import { fetchRooms, fetchPublicRooms, joinRoom } from './Utils'; // Import necessary functions

const ExploreRooms: React.FC = () => {
    const { keycloak, initialized } = useKeycloak();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [localRooms, setLocalRooms] = useState<any[]>([]);
    const [publicRooms, setPublicRooms] = useState<any[]>([]);

    const synapseBaseUrl = import.meta.env.VITE_SYNAPSE_BASE_URL;

    // Fetch local and public rooms
    const fetchRoomsData = async (token: string) => {
        try {
            // Fetch local rooms
            const localRoomsData = await fetchPublicRooms(token, synapseBaseUrl, false);
            setLocalRooms(localRoomsData);

            // Fetch federated public rooms
            const publicRoomsData = await fetchPublicRooms(token, synapseBaseUrl, true);
            setPublicRooms(publicRoomsData);
        } catch (err) {
            console.error('Error fetching rooms:', err);
            setError(err instanceof Error ? err.message : 'Unknown error occurred');
        } finally {
            setLoading(false);
        }
    };

    // Join a room
    const handleJoinRoom = async (roomId: string) => {
        const accessToken = localStorage.getItem('matrixAccessToken');
        if (!accessToken) {
            handleLogin();
            return;
        }

        try {
            await joinRoom(accessToken, synapseBaseUrl, roomId);

            // Save the room ID to localStorage
            localStorage.setItem('selectedRoom', roomId);

            // Navigate back to the chat page
            navigate('/chat');
        } catch (err) {
            console.error('Error joining room:', err);
            setError(err instanceof Error ? err.message : 'Unknown error occurred');
        }
    };

    useEffect(() => {
        const initialize = async () => {
            const storedAccessToken = localStorage.getItem('matrixAccessToken');

            if (!storedAccessToken) {
                handleLogin();
                return;
            }

            setLoading(true);
            await fetchRoomsData(storedAccessToken);
        };

        initialize();
    }, [navigate, synapseBaseUrl]);

    const handleCreateRoomClick = () => {
        navigate('/create-room'); // Navigate to the room creation page
    };

    if (loading) return <div>Loading rooms...</div>;
    if (error) return <div>Error: {error}</div>;

    return (
        <div id="public-rooms-container">
            <h1>Explore Rooms</h1>
            <div className="create-room-box" onClick={handleCreateRoomClick}>
                <div className="plus-sign">+</div>
                <p>Create Room</p>
            </div>

            {/* Local Rooms Section */}
            <h2>Rooms on This Server</h2>
            <ul>
                {publicRooms.map((room) => (
                    <li
                        key={room.room_id}
                        className="room-item"
                        onClick={() => handleJoinRoom(room.room_id)}
                    >
                        <div>
                            <h2>{room.name || room.canonical_alias || 'Unnamed Room'}</h2>
                            {room.avatar_url && (
                                <img
                                    src={`https://${synapseBaseUrl}/_matrix/media/r0/thumbnail/${room.avatar_url.replace('mxc://', '')}?width=40&height=40&method=crop`}
                                    alt={room.name || room.canonical_alias}
                                />
                            )}
                            <p>{room.topic || 'No topic provided'}</p>
                            <small>Members: {room.num_joined_members}</small>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default ExploreRooms;
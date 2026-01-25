import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import './css/CreateRoom.css';

type OrgDetail = {
    id: string;
    name: string;
    slug?: string;
    url?: string | null;
    rooms?: string[];
    events?: Array<{ title?: string; [key: string]: any }>;
};

const OrgManagement: React.FC = () => {
    const { orgId } = useParams();
    const { keycloak } = useAuth();
    const navigate = useNavigate();
    const [org, setOrg] = useState<OrgDetail | null>(null);
    const [roomId, setRoomId] = useState('');
    const [eventTitle, setEventTitle] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const headers = useMemo(() => {
        if (!keycloak?.token) return null;
        return {
            Authorization: `Bearer ${keycloak.token}`,
            'Content-Type': 'application/json',
        };
    }, [keycloak?.token]);

    const fetchOrg = async () => {
        if (!headers || !orgId) return;
        try {
            setIsLoading(true);
            if (keycloak?.isTokenExpired()) {
                await keycloak.updateToken(30);
            }
            const response = await fetch(
                `${import.meta.env.VITE_USERS_API_URL}/orgs/${orgId}`,
                { headers }
            );
            if (!response.ok) {
                setError('Unable to load organization');
                return;
            }
            const data = await response.json();
            setOrg(data);
        } catch (err) {
            console.error('Org fetch failed:', err);
            setError('Unable to load organization');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchOrg();
    }, [orgId, headers]);

    const handleAddRoom = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!roomId.trim() || !headers || !orgId) return;
        try {
            setIsSubmitting(true);
            if (keycloak?.isTokenExpired()) {
                await keycloak.updateToken(30);
            }
            const response = await fetch(
                `${import.meta.env.VITE_USERS_API_URL}/orgs/${orgId}/rooms`,
                {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ room_id: roomId.trim() }),
                }
            );
            if (!response.ok) {
                setError('Failed to add room');
                return;
            }
            setRoomId('');
            await fetchOrg();
        } catch (err) {
            console.error('Add room failed:', err);
            setError('Failed to add room');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAddEvent = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!eventTitle.trim() || !headers || !orgId) return;
        try {
            setIsSubmitting(true);
            if (keycloak?.isTokenExpired()) {
                await keycloak.updateToken(30);
            }
            const response = await fetch(
                `${import.meta.env.VITE_USERS_API_URL}/orgs/${orgId}/events`,
                {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ title: eventTitle.trim() }),
                }
            );
            if (!response.ok) {
                setError('Failed to add event');
                return;
            }
            setEventTitle('');
            await fetchOrg();
        } catch (err) {
            console.error('Add event failed:', err);
            setError('Failed to add event');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="create-room-page">
            <div className="create-room-card">
                <div className="create-room-header">
                    <div className="header-icon">🏢</div>
                    <div>
                        <p className="section-eyebrow">Org Management</p>
                        <h2>{org?.name || 'Organization'}</h2>
                    </div>
                </div>

                {error && <div className="error-message">{error}</div>}

                {isLoading ? (
                    <div className="helper-text">Loading org details…</div>
                ) : (
                    <>
                        <div className="helper-text">
                            Manage rooms and events for this organization.
                        </div>

                        <form className="create-room-form" onSubmit={handleAddRoom}>
                            <label htmlFor="org-room-id">Add room</label>
                            <div className="input-field">
                                <input
                                    id="org-room-id"
                                    type="text"
                                    value={roomId}
                                    onChange={(e) => setRoomId(e.target.value)}
                                    placeholder="room-123"
                                />
                                <span className="input-hint">
                                    Add an existing room ID to the org
                                </span>
                            </div>
                            <div className="form-actions">
                                <button
                                    type="submit"
                                    className="primary-button"
                                    disabled={!roomId.trim() || isSubmitting}
                                >
                                    {isSubmitting ? 'Adding...' : 'Add Room'}
                                </button>
                            </div>
                        </form>

                        <form className="create-room-form" onSubmit={handleAddEvent}>
                            <label htmlFor="org-event-title">Add event</label>
                            <div className="input-field">
                                <input
                                    id="org-event-title"
                                    type="text"
                                    value={eventTitle}
                                    onChange={(e) => setEventTitle(e.target.value)}
                                    placeholder="Quarterly review"
                                />
                                <span className="input-hint">
                                    Add a new event title for the org
                                </span>
                            </div>
                            <div className="form-actions">
                                <button
                                    type="submit"
                                    className="primary-button"
                                    disabled={!eventTitle.trim() || isSubmitting}
                                >
                                    {isSubmitting ? 'Adding...' : 'Add Event'}
                                </button>
                            </div>
                        </form>

                        <div className="form-actions">
                            <button
                                type="button"
                                className="ghost-button"
                                onClick={() => navigate('/chat')}
                            >
                                Back to chat
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default OrgManagement;

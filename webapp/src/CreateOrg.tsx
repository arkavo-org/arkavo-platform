import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import './css/CreateRoom.css';

const CreateOrg: React.FC = () => {
    const navigate = useNavigate();
    const { keycloak } = useAuth();
    const [orgName, setOrgName] = useState('');
    const [orgUrl, setOrgUrl] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleCreateOrg = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!orgName.trim()) {
            setError('Organization name is required');
            return;
        }

        if (!keycloak?.token) {
            setError('You must be signed in to create an organization');
            return;
        }

        try {
            setIsSubmitting(true);
            if (keycloak.isTokenExpired()) {
                await keycloak.updateToken(30);
            }
            const response = await fetch(
                `${import.meta.env.VITE_USERS_API_URL}/orgs`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${keycloak.token}`,
                    },
                    body: JSON.stringify({
                        name: orgName.trim(),
                        url: orgUrl.trim() || undefined,
                    }),
                }
            );

            if (!response.ok) {
                setError('Failed to create organization');
                return;
            }
            const data = await response.json();
            navigate(`/org/${data.id}`);
        } catch (err) {
            console.error('Create org failed:', err);
            setError('Something went wrong while creating the organization.');
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
                        <p className="section-eyebrow">Create Org</p>
                        <h2>Create organization</h2>
                    </div>
                </div>

                {error && <div className="error-message">{error}</div>}

                <form className="create-room-form" onSubmit={handleCreateOrg}>
                    <label htmlFor="org-name">Organization name</label>
                    <div className="input-field">
                        <input
                            id="org-name"
                            type="text"
                            value={orgName}
                            onChange={(e) => setOrgName(e.target.value)}
                            placeholder="e.g., Arkavo Labs, Sentinel Division"
                            maxLength={80}
                            required
                        />
                        <span className="input-hint">
                            {80 - orgName.length} characters remaining
                        </span>
                    </div>

                    <label htmlFor="org-url">Organization URL (optional)</label>
                    <div className="input-field">
                        <input
                            id="org-url"
                            type="text"
                            value={orgUrl}
                            onChange={(e) => setOrgUrl(e.target.value)}
                            placeholder="https://example.org"
                        />
                    </div>

                    <div className="form-actions">
                        <button
                            type="button"
                            className="ghost-button"
                            onClick={() => navigate('/chat')}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="primary-button"
                            disabled={!orgName.trim() || isSubmitting}
                        >
                            {isSubmitting ? 'Creating...' : 'Create Org'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CreateOrg;

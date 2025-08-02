import React from "react";
import { useAuth } from "./context/AuthContext";
import "./css/global.css";
import "./css/Profile.css";

interface UserProfileProps {
  userId: string;
  onClose: () => void;
  onMessage: () => void;
}

const UserProfile: React.FC<UserProfileProps> = ({ userId, onClose, onMessage }) => {
  const { keycloak } = useAuth();
  const [profileData, setProfileData] = React.useState<{
    display_name: string;
    picture: string;
    bio: string;
  } | null>(null);

  React.useEffect(() => {
    if (!keycloak?.authenticated) return;

    const loadProfile = async () => {
      try {
        await keycloak.updateToken(30);
        const response = await fetch(
          `${import.meta.env.VITE_USERS_API_URL}/profile/${userId}`,
          {
            headers: {
              Authorization: `Bearer ${keycloak.token}`
            }
          }
        );

        if (response.ok) {
          const data = await response.json();
          setProfileData({
            display_name: data.display_name || userId,
            picture: data.picture || '',
            bio: data.bio || ''
          });
        }
      } catch (err) {
        console.error("Error loading profile:", err);
      }
    };
    loadProfile();
  }, [keycloak, userId]);

  if (!profileData) {
    return (
      <div className="profile-modal-overlay">
        <div className="profile-modal-content">
          <div className="profile-container">
            <div>Loading profile...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-modal-overlay">
      <button className="modal-close-btn" onClick={onClose}>
        ×
      </button>
      <div className="profile-modal-content">
        <div className="profile-container">
          <div className="profile-header">
            <div>
              <img
                src={profileData.picture 
                  ? `data:image/jpeg;base64,${profileData.picture}` 
                  : '/assets/dummy-image.jpg'}
                className="profile-pic-large"
                alt="Profile"
              />
            </div>
            <div>
              <div className="profile-name">{profileData.display_name}</div>
            </div>
          </div>

          <div className="profile-form">
            {profileData.bio && (
              <div className="form-group">
                <label>Bio</label>
                <p>{profileData.bio}</p>
              </div>
            )}

            <div className="form-actions">
              <button 
                className="save-btn"
                onClick={onMessage}
              >
                Message
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;

import React, { useEffect, useState, useRef } from "react";
import { useAuth } from "./context/AuthContext";
import ImageEditorModal from "./components/ImageEditorModal";
import "./css/global.css";
import "./css/Profile.css";

interface ProfileProps {
  isModal?: boolean;
  onClose?: () => void;
}

const Profile: React.FC<ProfileProps> = ({ isModal = false, onClose = () => {} }) => {
  const { keycloak, isLoading } = useAuth();
  const [profileData, setProfileData] = useState<{ [key: string]: any } | null>(
    null
  );
  const [showImageEditor, setShowImageEditor] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isLoading || !keycloak) return;

    const loadProfile = async () => {
      try {
        if (!keycloak.authenticated) {
          await keycloak.login();
          return;
        }

        await keycloak.updateToken(30); // Refresh token if needed

        if (!keycloak.token) {
          throw new Error("No access token available");
        }

        const response = await fetch(
          `${import.meta.env.VITE_USERS_API_URL}/profile`,
          {
            headers: {
              Authorization: `Bearer ${keycloak.token}`,
            },
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.message ||
              `HTTP ${response.status}: ${response.statusText}`
          );
        }

        const data = await response.json();
        if (!data) {
          throw new Error("Empty response data");
        }

        // Use the data directly from the API response
        const transformedData = {
          name: data.name || "",
          email: data.email || "",
          display_name: data.display_name || "",
          bio: data.bio || "",
          picture: data.picture || "",
          street: data.street || "",
          city: data.city || "",
          state: data.state || "",
          zip_code: data.zip_code || "",
          country: data.country || ""
        };

        setProfileData(transformedData);
        localStorage.setItem("userProfile", JSON.stringify(transformedData));
      } catch (err) {
        console.error("Error loading profile:", err);
        setProfileData({
          name: "",
          email: "",
          display_name: "",
          bio: "",
          street: "",
          city: "",
          state: "",
          zip_code: "",
          country: ""
        });
      }
    };
    loadProfile();
  }, [keycloak, isLoading, keycloak?.authenticated]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImage(reader.result as string);
      setShowImageEditor(true);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveCroppedImage = async (croppedImage: string) => {
    if (!keycloak?.token) return;
    
    try {
      const blob = await fetch(croppedImage).then(r => r.blob());
      const formData = new FormData();
      formData.append('picture', blob);

      await keycloak.updateToken(30);
      if (!keycloak.token) {
        throw new Error("No access token available");
      }

      const response = await fetch(
        `${import.meta.env.VITE_USERS_API_URL}/users/picture`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${keycloak.token}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error('Failed to upload image');
      }

      const data = await response.json();
      if (profileData) {
        setProfileData({...profileData, picture: data.picture});
        localStorage.setItem("userProfile", JSON.stringify({
          ...profileData,
          picture: data.picture
        }));
      }
    } catch (err) {
      console.error('Error uploading image:', err);
    } finally {
      setShowImageEditor(false);
    }
  };

  const saveProfile = async () => {
    if (!keycloak?.token) return;

    try {
      const formData = {
        name: (document.getElementById("name") as HTMLInputElement).value,
        display_name: (
          document.getElementById("display-name") as HTMLInputElement
        ).value,
        bio: (document.getElementById("bio") as HTMLTextAreaElement).value,
        street: (document.getElementById("street") as HTMLInputElement).value,
        city: (document.getElementById("city") as HTMLInputElement).value,
        state: (document.getElementById("state") as HTMLInputElement).value,
        zip_code: (document.getElementById("zip") as HTMLInputElement).value,
        country: (document.getElementById("country") as HTMLInputElement).value,
      };

      await keycloak.updateToken(30); // Refresh token if needed
      if (!keycloak.token) {
        throw new Error("No access token available");
      }
      // Get username from keycloak token
      const username = keycloak.tokenParsed?.preferred_username;
      if (!username) {
        throw new Error("No username available in token");
      }

      const response = await fetch(
        `${import.meta.env.VITE_USERS_API_URL}/profile`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${keycloak.token}`,
          },
          body: JSON.stringify({
            ...formData,
            email: keycloak.tokenParsed?.email || "",
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to save profile");
      }
    } catch (err) {
      console.error("Error saving profile:", err);
    }
  };

  if (isLoading) return <div>Loading authentication...</div>;
  if (!keycloak) return <div>Authentication not available</div>;
  if (!profileData) {
    return <div>Loading profile...</div>;
  }

  return (
    <div id="app-container" className="dark-mode profile-modal">
      {showImageEditor && selectedImage && (
        <div style={{position: 'fixed', zIndex: 10001}}>
          <ImageEditorModal
            image={selectedImage}
            onClose={() => setShowImageEditor(false)}
            onSave={handleSaveCroppedImage}
          />
        </div>
      )}
      
      <div className="profile-modal-overlay" style={{zIndex: 9999}}>
        <button className="modal-close-btn" onClick={onClose} style={{zIndex: 10000}}>
          ×
        </button>
        <div className="profile-modal-content" style={{zIndex: 9999}}>
          <div className="profile-container">
            <div className="profile-header">
              <div onClick={() => {
                const imageToEdit = profileData.picture 
                  ? `data:image/jpeg;base64,${profileData.picture}`
                  : '/assets/dummy-image.jpg';
                setSelectedImage(imageToEdit);
                setShowImageEditor(true);
              }} style={{cursor: 'pointer', position: 'relative'}}>
                <img
                  src={profileData.picture ? `data:image/jpeg;base64,${profileData.picture}` : '/assets/dummy-image.jpg'}
                  className="profile-pic-large"
                  alt="Profile"
                />
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  background: 'rgba(0,0,0,0.7)',
                  color: 'white',
                  textAlign: 'center',
                  padding: '4px',
                  fontSize: '12px'
                }}>
                  {profileData.picture ? 'Edit photo' : 'Add photo'}
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{display: 'none'}}
                  accept="image/*"
                  onChange={handleImageUpload}
                />
              </div>
              <div>
                <div className="profile-name">{profileData.name || "User Profile"}</div>
                <p id="profile-email">{profileData.email || ""}</p>
              </div>
            </div>

            <div className="profile-form">
              <div className="form-group">
                <label htmlFor="name">Full Name</label>
                <input
                  type="text"
                  className="form-control"
                  id="name"
                  defaultValue={profileData.name || ""}
                  placeholder="Enter your full name"
                />
              </div>

              <div className="form-group">
                <label htmlFor="display-name">Display Name</label>
                <input
                  type="text"
                  className="form-control"
                  id="display-name"
                  defaultValue={profileData.display_name || ""}
                  placeholder="Enter your public display name"
                />
                <small className="form-text text-muted">
                  This name will be visible to other users
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="bio">Bio</label>
                <textarea id="bio" defaultValue={profileData.bio || ""} />
              </div>

              <div className="form-group">
                <label htmlFor="street">Street Address</label>
                <input
                  id="street"
                  type="text"
                  defaultValue={profileData.street || ""}
                />
              </div>

              <div className="form-group">
                <label htmlFor="city">City</label>
                <input
                  id="city"
                  type="text"
                  defaultValue={profileData.city || ""}
                />
              </div>

              <div className="form-group">
                <label htmlFor="state">State/Province</label>
                <input
                  id="state"
                  type="text"
                  defaultValue={profileData.state || ""}
                />
              </div>

              <div className="form-group">
                <label htmlFor="zip">Zip/Postal Code</label>
                <input
                  id="zip"
                  type="text"
                  defaultValue={profileData.zip_code || ""}
                />
              </div>

              <div className="form-group">
                <label htmlFor="country">Country</label>
                <input
                  id="country"
                  type="text"
                  defaultValue={profileData.country || ""}
                />
              </div>

              <div className="form-actions">
                <button id="save-btn" className="save-btn" onClick={saveProfile}>
                  Save Profile
                </button>
                <button
                  id="logout-btn"
                  className="logout-btn"
                  onClick={() => {
                    let returnUrl;
                    returnUrl = window.location.origin;
                    console.log("Logging out, redirecting to:", returnUrl);
                    keycloak?.logout({ redirectUri: returnUrl });
                  }}
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;

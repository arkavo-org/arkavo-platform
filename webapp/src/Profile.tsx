import React, { useEffect, useState } from "react";
import { useAuth } from "./context/AuthContext";
import "./css/global.css";
import "./css/Profile.css";

const Profile: React.FC = () => {
  const { keycloak, isLoading } = useAuth();
  const [profileData, setProfileData] = useState<{ [key: string]: any } | null>(
    null
  );

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
    <div id="app-container" className="dark-mode">
      <div className="profile-container">
        <div className="profile-header">
          {profileData.picture && (
            <img
              src={profileData.picture}
              className="profile-pic-large"
              alt="Profile"
            />
          )}
          <div>
            <h1 id="profile-name">{profileData.name || "User Profile"}</h1>
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
            <a href="/chat" className="exit-btn">
              Back to Chat
            </a>
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
  );
};

export default Profile;
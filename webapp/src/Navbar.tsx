import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useKeycloak } from '@react-keycloak/web';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBell, faEnvelope, faCalendar, faBullhorn, faPlusCircle } from '@fortawesome/free-solid-svg-icons';
import './css/Navbar.css';
import { loginAndFetchProfile, logoutAndClearProfile, UserProfile } from './keycloakUtils';
import { faLock } from "@fortawesome/free-solid-svg-icons";

const Navbar: React.FC = () => {
  const { keycloak, initialized } = useKeycloak(); // Access keycloak from ReactKeycloakProvider
  const navigate = useNavigate();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true); // Loading state

  useEffect(() => {
    if (initialized && keycloak.authenticated) {
      loginAndFetchProfile(keycloak).then((profile) => {
        setUserProfile(profile);
        setLoading(false); // Set loading to false when profile is fetched
      }).catch((error) => {
        console.error('Error fetching user profile:', error);
        setLoading(false); // Set loading to false even if an error occurs
      });
    } else {
      setLoading(false); // Set loading to false if not authenticated
    }
  }, [initialized, keycloak]);

  const handleLogout = () => {
    logoutAndClearProfile(keycloak);
    setUserProfile(null);
    setShowDropdown(false);
  };

  if (loading) {
    return <div>Loading...</div>; // Show loading state while fetching profile
  }

  return (
    <nav className="navbar">
      <div className="logo-container">
        <img src={import.meta.env.VITE_LOGO_URL} className="icon" alt="Arkavo logo" />
        <div className="navbar-logo">
          <a href="/" className="home-link">{import.meta.env.VITE_BRAND_NAME}</a>
        </div>
      </div>
      <form className="navbar-search">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search..."
          className="search-input"
        />
      </form>
      <div className="navbar-links">
        {userProfile ? (
          <div className="profile-elements">
            <FontAwesomeIcon
              icon={faPlusCircle}
              className="icon plus-icon"
              title="Create"
              onClick={() => navigate('/create')}
            />
            <FontAwesomeIcon
              icon={faLock}
              className="icon lock-icon"
              title="TDF"
              onClick={() => navigate('/tdf')}
            />
            <FontAwesomeIcon
              icon={faCalendar}
              className="icon events-icon"
              title="Events"
              onClick={() => navigate('/events')}
            />
            <FontAwesomeIcon
              icon={faBell}
              className="icon notification-icon"
              title="Notifications"
            />
            <FontAwesomeIcon
              icon={faEnvelope}
              className="icon dm-icon"
              title="Direct Messages"
              onClick={() => navigate('/chat')}
            />
            <img
              src={userProfile.picture}
              alt="Profile"
              className="profile-picture"
              onClick={() => setShowDropdown(!showDropdown)}
            />
            {showDropdown && (
              <div className="dropdown-menu">
                <button onClick={() => navigate('/profile')}>View Profile</button>
                <button onClick={() => navigate('/settings')}>Settings</button>
                <button onClick={handleLogout}>Logout</button>
              </div>
            )}
          </div>
        ) : (
          <button onClick={() => loginAndFetchProfile(keycloak)}>Sign In</button>
        )}
      </div>
    </nav>
  );
};

export default Navbar;

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBell,
  faEnvelope,
  faCalendar,
  faBullhorn,
  faPlusCircle,
  faLock,
} from "@fortawesome/free-solid-svg-icons";
import "./css/Navbar.css";
import { useAuth } from "./context/AuthContext";

interface NavbarProps {
  onProfileClick?: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ onProfileClick }) => {
  const { isAuthenticated, userProfile, login, logout } = useAuth();
  const navigate = useNavigate();
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const handleLogout = () => {
    logout();
    setShowDropdown(false);
  };

  return (
    <nav className="navbar">
      <div className="logo-container">
        <img
          src={import.meta.env.VITE_LOGO_URL}
          className="icon"
          alt="Arkavo logo"
        />
        <div className="navbar-logo">
          <a href="/" className="home-link">
            {import.meta.env.VITE_BRAND_NAME}
          </a>
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
        {isAuthenticated && userProfile ? (
          <div className="profile-elements">
            <FontAwesomeIcon
              icon={faPlusCircle}
              className="icon plus-icon"
              title="Create"
              onClick={() => navigate("/create")}
            />
            <FontAwesomeIcon
              icon={faLock}
              className="icon lock-icon"
              title="TDF"
              onClick={() => navigate("/tdf")}
            />
            <FontAwesomeIcon
              icon={faCalendar}
              className="icon events-icon"
              title="Events"
              onClick={() => navigate("/events")}
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
              onClick={() => navigate("/chat")}
            />
            <img
              src={userProfile.picture || '/assets/default-profile.png'}
              className="profile-picture clickable"
              alt="Profile"
              onClick={onProfileClick}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  onProfileClick?.();
                }
              }}
            />
          </div>
        ) : (
          <button onClick={login} className="sign-in-button">
            Sign In
          </button>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
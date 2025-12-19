import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { useWebSocket } from "./context/WebSocketContext";

interface NavbarProps {
  onProfileClick?: () => void;
}

interface NotificationItem {
  id: string;
  type: string;
  room_id?: string;
  room_name?: string;
  invited_by?: string;
  timestamp?: string;
}

const Navbar: React.FC<NavbarProps> = ({ onProfileClick }) => {
  const { isAuthenticated, userProfile, login, logout, keycloak } = useAuth();
  const { ws } = useWebSocket();
  const navigate = useNavigate();
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotificationsPanel, setShowNotificationsPanel] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const notificationRef = useRef<HTMLDivElement>(null);

  const handleLogout = () => {
    logout();
    setShowDropdown(false);
  };

  const fetchNotifications = useCallback(async () => {
    if (!keycloak?.token) return;
    try {
      setNotificationsLoading(true);
      if (keycloak.isTokenExpired()) {
        await keycloak.updateToken(30);
      }
      const response = await fetch(
        `${import.meta.env.VITE_USERS_API_URL}/notifications`,
        {
          headers: {
            Authorization: `Bearer ${keycloak.token}`,
          },
        }
      );
      if (response.ok) {
        const data = await response.json();
        setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
        setNotificationsError(null);
      } else {
        setNotificationsError("Unable to load notifications");
      }
    } catch (error) {
      console.error("Notification fetch failed:", error);
      setNotificationsError("Unable to load notifications");
    } finally {
      setNotificationsLoading(false);
    }
  }, [keycloak]);

  useEffect(() => {
    if (!isAuthenticated) {
      setNotifications([]);
      return;
    }
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 45000);
    return () => clearInterval(interval);
  }, [isAuthenticated, fetchNotifications]);

  const markNotificationRead = useCallback(
    async (notificationId: string) => {
      if (!keycloak?.token) return;
      try {
        if (keycloak.isTokenExpired()) {
          await keycloak.updateToken(30);
        }
        await fetch(
          `${import.meta.env.VITE_USERS_API_URL}/notifications/${notificationId}/read`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${keycloak.token}`,
            },
          }
        );
        setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      } catch (error) {
        console.error("Failed to mark notification read:", error);
      }
    },
    [keycloak]
  );

  const handleNotificationNavigate = (notification: NotificationItem) => {
    if (notification.room_id) {
      navigate(`/chat/${notification.room_id}`);
      markNotificationRead(notification.id);
      setShowNotificationsPanel(false);
    }
  };

  useEffect(() => {
    if (!ws) return;

    const handleNotificationEvent = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (
          data?.type === "notification" &&
          data.notification &&
          data.notification.id
        ) {
          setNotifications((prev) => {
            if (prev.some((n) => n.id === data.notification.id)) {
              return prev;
            }
            return [data.notification, ...prev];
          });
        }
      } catch {
        // ignore non JSON
      }
    };

    ws.addEventListener("message", handleNotificationEvent);
    return () => {
      ws.removeEventListener("message", handleNotificationEvent);
    };
  }, [ws]);

  useEffect(() => {
    if (!showNotificationsPanel) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        notificationRef.current &&
        !notificationRef.current.contains(event.target as Node)
      ) {
        setShowNotificationsPanel(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showNotificationsPanel]);

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
            <div className="notification-wrapper" ref={notificationRef}>
              <FontAwesomeIcon
                icon={faBell}
                className="icon notifications-icon"
                title="Notifications"
                onClick={() => setShowNotificationsPanel((prev) => !prev)}
              />
              {notifications.length > 0 && (
                <span className="notification-badge">{notifications.length}</span>
              )}
              {showNotificationsPanel && (
                <div className="notifications-dropdown">
                  {notificationsLoading ? (
                    <div className="notification-message">Loading notifications…</div>
                  ) : notificationsError ? (
                    <div className="notification-message error">
                      {notificationsError}
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="notification-message">
                      You're all caught up!
                    </div>
                  ) : (
                    notifications.map((notification) => (
                      <div key={notification.id} className="notification-item">
                        <div className="notification-text">
                          {notification.type === "room_invite" ? (
                            <>
                              You were invited to{" "}
                              <strong>
                                {notification.room_name || notification.room_id}
                              </strong>
                            </>
                          ) : (
                            <>{notification.type}</>
                          )}
                        </div>
                        <div className="notification-actions">
                          {notification.room_id && (
                            <button
                              type="button"
                              onClick={() =>
                                handleNotificationNavigate(notification)
                              }
                            >
                              Open
                            </button>
                          )}
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => markNotificationRead(notification.id)}
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <FontAwesomeIcon
              icon={faCalendar}
              className="icon events-icon"
              title="Events"
              onClick={() => navigate("/events")}
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

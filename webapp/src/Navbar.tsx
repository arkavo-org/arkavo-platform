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
  faSearch,
  faBars,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";
import "./css/Navbar.css";
import { useAuth } from "./context/AuthContext";
import { useWebSocket } from "./context/WebSocketContext";
import ConnectionStatus from "./components/ConnectionStatus";

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

interface BrowsePerson {
  id: string;
  display: string;
  picture?: string;
}

interface BrowseRoom {
  id: string;
  name: string;
  is_public?: boolean;
}

interface BrowseOrg {
  id: string;
  name: string;
  url?: string;
}

const Navbar: React.FC<NavbarProps> = ({ onProfileClick }) => {
  const { isAuthenticated, userProfile, login, logout, keycloak } = useAuth();
  const { ws } = useWebSocket();
  const navigate = useNavigate();
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{
    people: { id: string; name: string; display: string; picture?: string }[];
    rooms: { id: string; name: string; is_public?: boolean }[];
    orgs: { id: string; name: string; url?: string }[];
  }>({ people: [], rooms: [], orgs: [] });
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotificationsPanel, setShowNotificationsPanel] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [browsePeople, setBrowsePeople] = useState<BrowsePerson[]>([]);
  const [browseRooms, setBrowseRooms] = useState<BrowseRoom[]>([]);
  const [browseOrgs, setBrowseOrgs] = useState<BrowseOrg[]>([]);
  const notificationRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const handleLogout = () => {
    logout();
    setShowDropdown(false);
    setMobileMenuOpen(false);
    setMobileSearchOpen(false);
  };

  const closeMobileOverlays = () => {
    setMobileMenuOpen(false);
    setMobileSearchOpen(false);
    setBrowseOpen(false);
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    closeMobileOverlays();
  };

  const buildDmRoomId = (userA: string, userB: string) =>
    [userA, userB].sort().join("_");

  useEffect(() => {
    const fetchBrowseData = async () => {
      if (!keycloak?.token) return;
      try {
        setBrowseLoading(true);
        setBrowseError(null);
        if (keycloak.isTokenExpired()) {
          await keycloak.updateToken(30);
        }
        const headers = {
          Authorization: `Bearer ${keycloak.token}`,
        };

        const peoplePromise = fetch(
          `${import.meta.env.VITE_USERS_API_URL}/people`,
          { headers }
        );
        const roomsPromise = fetch(
          `${import.meta.env.VITE_USERS_API_URL}/user/rooms`,
          { headers }
        );
        const orgsPromise = fetch(
          `${import.meta.env.VITE_USERS_API_URL}/orgs`,
          { headers }
        );

        const [peopleRes, roomsRes, orgsRes] = await Promise.all([
          peoplePromise,
          roomsPromise,
          orgsPromise,
        ]);

        if (peopleRes.ok) {
          const data = await peopleRes.json();
          const people = Array.isArray(data.people) ? data.people : [];
          setBrowsePeople(
            people
              .map((p: any) => ({
                id: p.uuid || p.id || p.userId || "",
                display:
                  p.display_name ||
                  p.displayName ||
                  p.name ||
                  "Unknown user",
                picture: p.picture,
              }))
              .filter((p: any) => p.id)
          );
        }

        if (roomsRes.ok) {
          const data = await roomsRes.json();
          const rooms = Array.isArray(data.rooms) ? data.rooms : [];
          setBrowseRooms(
            rooms
              .filter((room: any) => !String(room.id || "").includes("_"))
              .map((room: any) => ({
                id: room.id,
                name: room.name || room.id,
                is_public: room.is_public,
              }))
          );
        }

        if (orgsRes.ok) {
          const data = await orgsRes.json();
          const orgs = Array.isArray(data.orgs) ? data.orgs : [];
          setBrowseOrgs(
            orgs
              .map((org: any) => ({
                id: org.id || org.uuid || org.slug || "",
                name: org.name || org.title || org.slug || "Unknown org",
                url: org.url,
              }))
              .filter((org: any) => org.id)
          );
        }
      } catch (error) {
        console.error("Browse load failed:", error);
        setBrowseError("Unable to load browse data");
      } finally {
        setBrowseLoading(false);
      }
    };

    if (isAuthenticated && browseOpen) {
      fetchBrowseData();
    }
  }, [browseOpen, isAuthenticated, keycloak]);

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
      closeMobileOverlays();
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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!keycloak?.token || query.length < 2) {
      setSearchResults({ people: [], rooms: [], orgs: [] });
      setSearchError(null);
      setSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    const runSearch = async () => {
      try {
        setSearchLoading(true);
        setSearchError(null);
        if (keycloak.isTokenExpired()) {
          await keycloak.updateToken(30);
        }
        const headers = {
          Authorization: `Bearer ${keycloak.token}`,
        };

        const peoplePromise = fetch(
          `${import.meta.env.VITE_USERS_API_URL}/people`,
          { headers, signal: controller.signal }
        );
        const roomsPromise = fetch(
          `${import.meta.env.VITE_USERS_API_URL}/rooms`,
          { headers, signal: controller.signal }
        );

        const orgPromise = fetch(
          `${import.meta.env.VITE_USERS_API_URL}/orgs`,
          { headers, signal: controller.signal }
        ).catch(() => null);

        const [peopleRes, roomsRes, orgRes] = await Promise.all([
          peoplePromise.catch(() => null),
          roomsPromise.catch(() => null),
          orgPromise,
        ]);

        const nextResults = { people: [] as any[], rooms: [] as any[], orgs: [] as any[] };
        const qLower = query.toLowerCase();

        if (peopleRes && peopleRes.ok) {
          const data = await peopleRes.json();
          const people = Array.isArray(data.people) ? data.people : [];
          nextResults.people = people
            .map((p: any) => ({
              id: p.uuid || p.id || p.userId || "",
              name: p.name || p.display_name || p.displayName || "",
              display: p.display_name || p.displayName || p.name || "Unknown user",
              picture: p.picture,
            }))
            .filter((p: any) =>
              [p.name, p.display, p.id].some((val) =>
                String(val || "").toLowerCase().includes(qLower)
              )
            )
            .slice(0, 6);
        }

        if (roomsRes && roomsRes.ok) {
          const rooms = await roomsRes.json();
          nextResults.rooms = (Array.isArray(rooms) ? rooms : [])
            .filter((room: any) =>
              String(room.name || room.id || "")
                .toLowerCase()
                .includes(qLower)
            )
            .slice(0, 6);
        }

        if (orgRes && orgRes.ok) {
          const orgData = await orgRes.json();
          const orgs = Array.isArray(orgData?.orgs) ? orgData.orgs : Array.isArray(orgData) ? orgData : [];
          nextResults.orgs = orgs
            .map((org: any) => ({
              id: org.id || org.uuid || org.slug || "",
              name: org.name || org.title || org.slug || "",
              url: org.url,
            }))
            .filter((org: any) =>
              String(org.name || org.id || "")
                .toLowerCase()
                .includes(qLower)
            )
            .slice(0, 6);
        }

        setSearchResults(nextResults);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Search failed", err);
        setSearchError("Search unavailable right now");
      } finally {
        if (!controller.signal.aborted) {
          setSearchLoading(false);
        }
      }
    };

    const handle = window.setTimeout(runSearch, 200);
    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [searchQuery, keycloak]);

  const handleUserSearchSelect = (userId: string) => {
    const currentUserId = keycloak?.tokenParsed?.sub;
    if (!currentUserId) return;
    const roomId = buildDmRoomId(currentUserId, userId);
    handleNavigate(`/chat/${roomId}`);
    setShowSearchResults(false);
  };

  const handleRoomSearchSelect = async (roomId: string) => {
    if (keycloak?.token) {
      try {
        if (keycloak.isTokenExpired()) {
          await keycloak.updateToken(30);
        }
        await fetch(
          `${import.meta.env.VITE_USERS_API_URL}/rooms/${roomId}/join`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${keycloak.token}`,
            },
          }
        );
      } catch (err) {
        console.error("Failed to join room", err);
      }
    }
    handleNavigate(`/chat/${roomId}`);
    setShowSearchResults(false);
  };

  const handleOrgSearchSelect = (orgId: string, url?: string) => {
    setShowSearchResults(false);
    if (url) {
      window.open(url, "_blank");
    } else {
      navigate(`/org/${orgId}`);
    }
  };

  const handleBrowsePersonSelect = (userId: string) => {
    const currentUserId = keycloak?.tokenParsed?.sub;
    if (!currentUserId) return;
    const roomId = buildDmRoomId(currentUserId, userId);
    handleNavigate(`/chat/${roomId}`);
    setBrowseOpen(false);
  };

  const handleBrowseRoomSelect = (roomId: string) => {
    handleNavigate(`/chat/${roomId}`);
    setBrowseOpen(false);
  };

  const handleBrowseOrgSelect = (org: BrowseOrg) => {
    if (org.url) {
      window.open(org.url, "_blank");
      setBrowseOpen(false);
      return;
    }
    handleNavigate(`/org/${org.id}`);
    setBrowseOpen(false);
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

      <div
        className={`navbar-search ${isMobileSearchOpen ? "open" : ""}`}
        ref={searchRef}
      >
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setShowSearchResults(true);
          }}
          onFocus={() => setShowSearchResults(true)}
          placeholder="Search people, rooms, orgs..."
          className="search-input"
        />
        <button
          type="button"
          className="search-close"
          onClick={() => {
            setMobileSearchOpen(false);
            setShowSearchResults(false);
          }}
          aria-label="Close search"
        >
          <FontAwesomeIcon icon={faTimes} />
        </button>
        {showSearchResults && (
          <div className="search-results">
            {searchLoading && <div className="search-row">Searching…</div>}
            {searchError && <div className="search-row error">{searchError}</div>}

            {!searchLoading && !searchError && (
              <>
                <div className="search-section">
                  <div className="search-section-title">People</div>
                  {searchResults.people.length === 0 ? (
                    <div className="search-row muted">No people found</div>
                  ) : (
                    searchResults.people.map((p) => (
                      <button
                        key={p.id}
                        className="search-row"
                        onClick={() => handleUserSearchSelect(p.id)}
                      >
                        <div className="search-avatar">
                          {p.picture ? (
                            <img
                              src={
                                p.picture.startsWith("data:")
                                  ? p.picture
                                  : `data:image/jpeg;base64,${p.picture}`
                              }
                              alt={p.display || p.name}
                            />
                          ) : (
                            <span>{(p.display || p.name || "?").charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                        <div className="search-meta">
                          <div className="search-name">{p.display || p.name}</div>
                        </div>
                      </button>
                    ))
                  )}
                </div>

                <div className="search-section">
                  <div className="search-section-title">Rooms</div>
                  {searchResults.rooms.length === 0 ? (
                    <div className="search-row muted">No rooms found</div>
                  ) : (
                    searchResults.rooms.map((room) => (
                      <button
                        key={room.id}
                        className="search-row"
                        onClick={() => handleRoomSearchSelect(room.id)}
                      >
                        <div className="search-avatar room">
                          <span>{(room.name || room.id).charAt(0).toUpperCase()}</span>
                        </div>
                        <div className="search-meta">
                          <div className="search-name">{room.name || room.id}</div>
                          <div className="search-sub">
                            {room.is_public ? "Public room" : "Private room"}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>

                <div className="search-section">
                  <div className="search-section-title">Orgs</div>
                  {searchResults.orgs.length === 0 ? (
                    <div className="search-row muted">No orgs found</div>
                  ) : (
                    searchResults.orgs.map((org) => (
                      <button
                        key={org.id}
                        className="search-row"
                        onClick={() => handleOrgSearchSelect(org.id, org.url)}
                      >
                        <div className="search-avatar org">
                          <span>{(org.name || org.id).charAt(0).toUpperCase()}</span>
                        </div>
                        <div className="search-meta">
                          <div className="search-name">{org.name || org.id}</div>
                          <div className="search-sub">{org.url || org.id}</div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="navbar-mobile-actions">
        <button
          type="button"
          className="icon-button"
          onClick={() => setMobileSearchOpen((prev) => !prev)}
          aria-label="Open search"
        >
          <FontAwesomeIcon icon={isMobileSearchOpen ? faTimes : faSearch} />
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          aria-label="Open menu"
          aria-expanded={isMobileMenuOpen}
        >
          <FontAwesomeIcon icon={isMobileMenuOpen ? faTimes : faBars} />
        </button>
      </div>

      <div className="navbar-standalone">
        <div className="notification-wrapper" ref={notificationRef}>
          <button
            type="button"
            className="nav-trigger icon-only"
            onClick={() => setShowNotificationsPanel((prev) => !prev)}
            aria-label="Notifications"
          >
            <FontAwesomeIcon
              icon={faBell}
              className="icon notifications-icon"
              title="Notifications"
            />
            {notifications.length > 0 && (
              <span className="notification-badge">{notifications.length}</span>
            )}
          </button>
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
      </div>

      <div className={`navbar-links ${isMobileMenuOpen ? "open" : ""}`}>
        {isAuthenticated && userProfile ? (
          <div className="profile-elements">
            <button
              type="button"
              className="nav-trigger nav-item"
              onClick={() => setBrowseOpen((prev) => !prev)}
            >
              <FontAwesomeIcon
                icon={faBars}
                className="icon"
                title="Browse"
              />
              <span className="nav-label">People · Rooms · Orgs</span>
            </button>
            <button
              type="button"
              className="nav-trigger nav-item"
              onClick={() => handleNavigate("/events")}
            >
              <FontAwesomeIcon
                icon={faCalendar}
                className="icon events-icon"
                title="Events"
              />
              <span className="nav-label">Events</span>
            </button>
            <button
              type="button"
              className="nav-trigger nav-item"
              onClick={() => handleNavigate("/create-org")}
            >
              <FontAwesomeIcon
                icon={faPlusCircle}
                className="icon events-icon"
                title="Create Org"
              />
              <span className="nav-label">Create Org</span>
            </button>
            <button
              type="button"
              className="nav-trigger nav-item"
              onClick={() => handleNavigate("/chat")}
            >
              <FontAwesomeIcon
                icon={faEnvelope}
                className="icon dm-icon"
                title="Direct Messages"
              />
              <span className="nav-label">Direct Messages</span>
            </button>
            <button
              type="button"
              className="nav-trigger nav-item profile-trigger"
              onClick={() => {
                closeMobileOverlays();
                onProfileClick?.();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  closeMobileOverlays();
                  onProfileClick?.();
                }
              }}
            >
              <img
                src={userProfile.picture || '/assets/default-profile.png'}
                className="profile-picture clickable"
                alt="Profile"
              />
              <span className="nav-label">Profile</span>
            </button>
          </div>
        ) : (
          <button onClick={login} className="sign-in-button nav-trigger nav-item">
            Sign In
          </button>
        )}
        {isAuthenticated && browseOpen && (
          <div className="browse-panel">
            {browseLoading && (
              <div className="browse-message">Loading…</div>
            )}
            {browseError && (
              <div className="browse-message error">{browseError}</div>
            )}
            {!browseLoading && !browseError && (
              <>
                <div className="browse-section">
                  <div className="browse-title">People</div>
                  {browsePeople.length === 0 ? (
                    <div className="browse-row muted">No people found</div>
                  ) : (
                    browsePeople.slice(0, 6).map((person) => (
                      <button
                        key={person.id}
                        className="browse-row"
                        onClick={() => handleBrowsePersonSelect(person.id)}
                      >
                        <div className="browse-avatar">
                          {person.picture ? (
                            <img
                              src={
                                person.picture.startsWith("data:")
                                  ? person.picture
                                  : `data:image/jpeg;base64,${person.picture}`
                              }
                              alt={person.display}
                            />
                          ) : (
                            <span>{person.display.charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                        <div className="browse-meta">
                          <div className="browse-name">{person.display}</div>
                        </div>
                      </button>
                    ))
                  )}
                </div>

                <div className="browse-section">
                  <div className="browse-title">Rooms</div>
                  {browseRooms.length === 0 ? (
                    <div className="browse-row muted">No rooms yet</div>
                  ) : (
                    browseRooms.slice(0, 6).map((room) => (
                      <button
                        key={room.id}
                        className="browse-row"
                        onClick={() => handleBrowseRoomSelect(room.id)}
                      >
                        <div className="browse-avatar room">
                          <span>{(room.name || room.id).charAt(0).toUpperCase()}</span>
                        </div>
                        <div className="browse-meta">
                          <div className="browse-name">{room.name}</div>
                          <div className="browse-sub">
                            {room.is_public ? "Public room" : "Private room"}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>

                <div className="browse-section">
                  <div className="browse-title">Orgs</div>
                  {browseOrgs.length === 0 ? (
                    <div className="browse-row muted">No orgs yet</div>
                  ) : (
                    browseOrgs.slice(0, 6).map((org) => (
                      <button
                        key={org.id}
                        className="browse-row"
                        onClick={() => handleBrowseOrgSelect(org)}
                      >
                        <div className="browse-avatar org">
                          <span>{(org.name || org.id).charAt(0).toUpperCase()}</span>
                        </div>
                        <div className="browse-meta">
                          <div className="browse-name">{org.name}</div>
                          <div className="browse-sub">{org.url || org.id}</div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <ConnectionStatus />
    </nav>
  );
};

export default Navbar;

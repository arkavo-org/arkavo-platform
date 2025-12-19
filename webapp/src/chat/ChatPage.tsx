import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "../css/global.css";
import "../css/ChatPage.css";
import Room from "./Room";
import ExploreRooms from "./ExploreRooms";
import { useWebSocket } from "../context/WebSocketContext";

function getOtherUserId(roomId: string, currentUserId: string): string {
  const [id1, id2] = roomId.split("_");
  return id1 === currentUserId ? id2 : id1;
}

interface Room {
  id: string;
  name: string;
  is_public: boolean;
}

interface UserProfileSummary {
  displayName: string;
  picture?: string;
}

interface PersonEntry {
  userId: string;
  roomId: string;
  displayName: string;
  picture?: string;
}

interface PeopleApiEntry {
  uuid?: string;
  display_name?: string;
  name?: string;
  picture?: string;
}

const buildDmRoomId = (userA: string, userB: string) =>
  [userA, userB].sort().join("_");

const shuffleEntries = <T,>(items: T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const selectRandomPeople = (
  entries: PersonEntry[],
  currentUserId?: string
): PersonEntry[] => {
  if (!entries.length) {
    return [];
  }

  const deduped = Array.from(
    new Map(entries.map((entry) => [entry.userId, entry])).values()
  );

  if (!currentUserId) {
    return shuffleEntries(deduped).slice(0, 5);
  }

  const selfEntry = deduped.find((entry) => entry.userId === currentUserId);
  const others = deduped.filter((entry) => entry.userId !== currentUserId);
  const shuffledOthers = shuffleEntries(others);

  if (!selfEntry) {
    return shuffleEntries(deduped).slice(0, 5);
  }

  const limit = Math.max(5 - 1, 0);
  const selection = [selfEntry, ...shuffledOthers.slice(0, limit)];
  return selection.slice(0, 5);
};

const ChatPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, keycloak } = useAuth();
  const { ws } = useWebSocket();
  const { roomId: urlRoomId } = useParams();
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [showExplore, setShowExplore] = useState(false);
  const [userRooms, setUserRooms] = useState<Room[]>([]);
  const [userProfiles, setUserProfiles] = useState<
    Record<string, UserProfileSummary>
  >({});
  const [peoplePool, setPeoplePool] = useState<PersonEntry[]>([]);
  const [visiblePeople, setVisiblePeople] = useState<PersonEntry[]>([]);
  const [unreadRooms, setUnreadRooms] = useState<Record<string, boolean>>({});

  const markRoomAsRead = useCallback((roomId?: string | null) => {
    if (!roomId) return;
    setUnreadRooms((prev) => {
      if (!prev[roomId]) {
        return prev;
      }
      const updated = { ...prev };
      delete updated[roomId];
      return updated;
    });
  }, []);

  useEffect(() => {
    document.body.classList.add("chat-page-locked");
    return () => {
      document.body.classList.remove("chat-page-locked");
    };
  }, []);

  useEffect(() => {
    // Always sync activeRoom with URL
    if (urlRoomId) {
      setActiveRoom(urlRoomId);
      markRoomAsRead(urlRoomId);
    } else {
      setActiveRoom(null);
    }
  }, [urlRoomId]);

  useEffect(() => {
    // Update URL when activeRoom changes (except initial load)
    if (activeRoom && activeRoom !== urlRoomId) {
      navigate(`/chat/${activeRoom}`, { replace: true });
    }
  }, [activeRoom, urlRoomId, navigate]);
  useEffect(() => {
    markRoomAsRead(activeRoom);
  }, [activeRoom, markRoomAsRead]);

  useEffect(() => {
    const fetchUserRooms = async () => {
      try {
        if (keycloak?.isTokenExpired()) {
          await keycloak.updateToken(30);
        }

        const response = await fetch(
          `${import.meta.env.VITE_USERS_API_URL}/user/rooms`,
          {
            headers: {
              Authorization: `Bearer ${keycloak?.token}`,
            },
          }
        );
        if (response.ok) {
          const data = await response.json();
          setUserRooms(data.rooms);
        }
      } catch (error) {
        console.error("Failed to fetch user rooms:", error);
      }
    };

    if (isAuthenticated && keycloak?.token) {
      fetchUserRooms();
    }
  }, [isAuthenticated, keycloak?.token]);

  useEffect(() => {
    const fetchPeople = async () => {
      if (!keycloak?.token) return;

      try {
        if (keycloak.isTokenExpired()) {
          await keycloak.updateToken(30);
        }

        const response = await fetch(
          `${import.meta.env.VITE_USERS_API_URL}/people`,
          {
            headers: {
              Authorization: `Bearer ${keycloak.token}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          const currentUserId = keycloak.tokenParsed?.sub;
          const apiPeople: PeopleApiEntry[] = Array.isArray(data.people)
            ? data.people
            : [];
          let people: PersonEntry[] = apiPeople
            .filter(
              (person): person is PeopleApiEntry & { uuid: string } =>
                typeof person.uuid === "string" && person.uuid.length > 0
            )
            .map((person) => {
              const userId = person.uuid;
              const displayName =
                person.display_name || person.name || userId;
              return {
                userId,
                roomId:
                  currentUserId && userId
                    ? buildDmRoomId(currentUserId, userId)
                    : userId,
                displayName,
                picture: person.picture,
              };
            });

          if (
            currentUserId &&
            !people.some((entry) => entry.userId === currentUserId)
          ) {
            people = [
              ...people,
              {
                userId: currentUserId,
                roomId: buildDmRoomId(currentUserId, currentUserId),
                displayName:
                  keycloak.tokenParsed?.name ||
                  keycloak.tokenParsed?.preferred_username ||
                  "You",
                picture: undefined,
              },
            ];
          }

          setPeoplePool(people);
          setUserProfiles((prev) => {
            const updated = { ...prev };
            people.forEach((entry) => {
              updated[entry.userId] = {
                displayName: entry.displayName,
                picture: entry.picture,
              };
            });
            return updated;
          });
        }
      } catch (error) {
        console.error("Failed to fetch people:", error);
      }
    };

    if (isAuthenticated && keycloak?.token) {
      fetchPeople();
    }
  }, [isAuthenticated, keycloak?.token, keycloak?.tokenParsed?.sub]);

  useEffect(() => {
    setVisiblePeople(
      selectRandomPeople(peoplePool, keycloak?.tokenParsed?.sub)
    );
  }, [peoplePool, keycloak?.tokenParsed?.sub]);

  useEffect(() => {
    if (!ws) return;

    const handleIncomingMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        const roomId = data?.roomId;
        if (!roomId || roomId === activeRoom) {
          return;
        }
        setUnreadRooms((prev) => {
          if (prev[roomId]) {
            return prev;
          }
          return { ...prev, [roomId]: true };
        });
      } catch (error) {
        console.debug("Ignored non-message websocket payload");
      }
    };

    ws.addEventListener("message", handleIncomingMessage);
    return () => {
      ws.removeEventListener("message", handleIncomingMessage);
    };
  }, [ws, activeRoom]);

  const fetchUserProfileSummary = async (
    userId: string
  ): Promise<UserProfileSummary> => {
    if (!keycloak?.token) {
      return { displayName: userId };
    }

    try {
      if (keycloak.isTokenExpired()) {
        await keycloak.updateToken(30);
      }

      const response = await fetch(
        `${import.meta.env.VITE_USERS_API_URL}/profile/${userId}`,
        {
          headers: {
            Authorization: `Bearer ${keycloak.token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        return {
          displayName: data.display_name || userId,
          picture: data.picture,
        };
      }
    } catch (error) {
      console.error("Failed to fetch user profile:", error);
    }

    return { displayName: userId };
  };

  useEffect(() => {
    const fetchMissingProfiles = async () => {
      if (!keycloak?.tokenParsed?.sub) return;

      const currentUserId = keycloak.tokenParsed.sub;
      const dmRooms = userRooms.filter((room) => room.id.includes("_"));
      if (!dmRooms.length) return;

      const otherUserIds = Array.from(
        new Set(
          dmRooms
            .map((room) => getOtherUserId(room.id, currentUserId))
            .filter((id): id is string => Boolean(id))
        )
      );

      const missingIds = otherUserIds.filter((id) => !userProfiles[id]);
      if (!missingIds.length) return;

      try {
        const fetchedProfiles = await Promise.all(
          missingIds.map(async (userId) => {
            const profile = await fetchUserProfileSummary(userId);
            return { userId, profile };
          })
        );

        if (fetchedProfiles.length) {
          setUserProfiles((prev) => {
            const updated = { ...prev };
            fetchedProfiles.forEach(({ userId, profile }) => {
              updated[userId] = profile;
            });
            return updated;
          });
        }
      } catch (error) {
        console.error("Failed to load people profiles:", error);
      }
    };

    fetchMissingProfiles();
  }, [userRooms, userProfiles, keycloak?.tokenParsed?.sub, keycloak?.token]);

  const ensureRoomExists = async (roomId: string) => {
    if (!keycloak?.token) return;
    try {
      if (keycloak.isTokenExpired()) {
        await keycloak.updateToken(30);
      }

      const response = await fetch(
        `${import.meta.env.VITE_USERS_API_URL}/rooms/${roomId}`,
        {
          headers: {
            Authorization: `Bearer ${keycloak.token}`,
          },
        }
      );

      if (!response.ok) {
        console.error("Failed to ensure room exists:", response.status);
      }
    } catch (error) {
      console.error("Error ensuring room exists:", error);
    }
  };

  const handleRoomSelect = async (roomId: string) => {
    if (roomId !== activeRoom) {
      if (roomId.includes("_")) {
        await ensureRoomExists(roomId);
      }
      setActiveRoom(roomId);
      markRoomAsRead(roomId);
      setShowExplore(false);
      // URL update will be handled by the effect above

      if (roomId.includes("_") && keycloak?.tokenParsed?.sub) {
        const otherUserId = getOtherUserId(roomId, keycloak.tokenParsed.sub);
        if (!userProfiles[otherUserId]) {
          const profile = await fetchUserProfileSummary(otherUserId);
          setUserProfiles((prev) => ({
            ...prev,
            [otherUserId]: profile,
          }));
        }
      }
    }
  };

  const handleCreateRoom = () => {
    navigate("/create-room");
  };

  return (
    <div className="chat-page">
      <div className="sidebar">
        <div className="people-list">
          <h2>People</h2>
          {visiblePeople.length > 0 ? (
            visiblePeople.map((person) => (
              <div
                key={person.userId}
                className="person-item"
                onClick={() => handleRoomSelect(person.roomId)}
              >
                {person.picture ? (
                  <img
                    src={
                      person.picture.startsWith("data:")
                        ? person.picture
                        : `data:image/jpeg;base64,${person.picture}`
                    }
                    alt={person.displayName}
                  />
                ) : (
                  <div className="person-avatar-fallback">
                    {person.displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="person-meta">
                  <div className="person-name">{person.displayName}</div>
                  <div className="person-id">{person.userId}</div>
                </div>
                {unreadRooms[person.roomId] && (
                  <span className="room-alert" title="Unread messages">
                    !
                  </span>
                )}
              </div>
            ))
          ) : (
            <div className="people-empty">No people to show yet</div>
          )}
        </div>
        <h2>Chat Rooms</h2>
        <div className="room-list">
          {userRooms
            ?.filter((room) => !room.id.includes("_"))
            .map((room) => (
            <div
              key={room.id}
              className={`room-item ${activeRoom === room.id ? "active" : ""}`}
              onClick={() => handleRoomSelect(room.id)}
            >
              <span className="room-name">{room.name}</span>
              {unreadRooms[room.id] && (
                <span className="room-alert" title="Unread messages">
                  !
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="room-actions">
          <button className="add-room" onClick={() => setShowExplore(true)}>
            Explore Rooms
          </button>
          <button className="add-room" onClick={handleCreateRoom}>
            Create Room
          </button>
        </div>
      </div>
      <div className="chat-area">
        {showExplore && <ExploreRooms onRoomSelect={handleRoomSelect} />}
        {!showExplore && activeRoom && <Room roomId={activeRoom} />}
        {!showExplore && !activeRoom && (
          <div className="select-room">
            <h3>Select a room to start chatting</h3>
          </div>
        )}
      </div>
      </div>
  );
};

export default ChatPage;

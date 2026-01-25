import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "../css/global.css";
import "../css/ChatPage.css";
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

type Suggestion =
  | { type: "room"; id: string; name: string; is_public?: boolean }
  | { type: "person"; id: string; name: string; picture?: string };

const YourChats: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, keycloak } = useAuth();
  const { ws } = useWebSocket();
  const [userRooms, setUserRooms] = useState<Room[]>([]);
  const [userProfiles, setUserProfiles] = useState<
    Record<string, UserProfileSummary>
  >({});
  const [unreadRooms, setUnreadRooms] = useState<Record<string, boolean>>({});
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);

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

  const fetchUserRooms = useCallback(async () => {
    if (!isAuthenticated || !keycloak?.token) return;
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
  }, [isAuthenticated, keycloak]);

  useEffect(() => {
    fetchUserRooms();
  }, [fetchUserRooms]);

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
                person.display_name || person.name || "Unknown user";
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
    if (!ws) return;

    const handleIncomingMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        const roomId = data?.roomId;
        if (!roomId) {
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
  }, [ws]);

  const fetchUserProfileSummary = async (
    userId: string
  ): Promise<UserProfileSummary> => {
    if (!keycloak?.token) {
      return { displayName: "Unknown user" };
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
          displayName: data.display_name || "Unknown user",
          picture: data.picture,
        };
      }
    } catch (error) {
      console.error("Failed to fetch user profile:", error);
    }

    return { displayName: "Unknown user" };
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
    if (roomId.includes("_")) {
      await ensureRoomExists(roomId);
    }
    navigate(`/chat/${roomId}`);
    markRoomAsRead(roomId);
  };

  const shuffle = <T,>(items: T[]): T[] => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (!keycloak?.token) return;
      try {
        setSuggestionsLoading(true);
        setSuggestionsError(null);
        if (keycloak.isTokenExpired()) {
          await keycloak.updateToken(30);
        }

        const headers = {
          Authorization: `Bearer ${keycloak.token}`,
        };

        const publicRoomsResponse = await fetch(
          `${import.meta.env.VITE_USERS_API_URL}/rooms`,
          { headers }
        );
        const publicRooms = publicRoomsResponse.ok
          ? await publicRoomsResponse.json()
          : [];
        const existingRoomIds = new Set(userRooms.map((room) => room.id));

        const publicRoomSuggestions = (Array.isArray(publicRooms) ? publicRooms : [])
          .filter((room: any) => room.is_public && !existingRoomIds.has(room.id))
          .map((room: any) => ({
            type: "room" as const,
            id: room.id,
            name: room.name || room.id,
            is_public: room.is_public,
          }));

        const currentUserId = keycloak.tokenParsed?.sub;
        const dmPartners = new Set(
          userRooms
            .filter((room) => room.id.includes("_"))
            .map((room) => getOtherUserId(room.id, currentUserId || ""))
        );

        const roomsToScan = userRooms.filter(
          (room) => !room.id.includes("_")
        );

        const memberResponses = await Promise.all(
          roomsToScan.map(async (room) => {
            const response = await fetch(
              `${import.meta.env.VITE_USERS_API_URL}/rooms/${room.id}/members`,
              { headers }
            );
            if (!response.ok) {
              return [];
            }
            const data = await response.json();
            return Array.isArray(data.members) ? data.members : [];
          })
        );

        const memberCandidates = memberResponses.flat();
        const peopleSuggestions = memberCandidates
          .filter((member: any) => member.uuid && member.uuid !== currentUserId)
          .filter((member: any) => !dmPartners.has(member.uuid))
          .map((member: any) => ({
            type: "person" as const,
            id: member.uuid,
            name: member.display_name || member.name || "Unknown user",
            picture: member.picture,
          }));

        const combined = shuffle([
          ...publicRoomSuggestions,
          ...peopleSuggestions,
        ]).slice(0, 10);

        setSuggestions(combined);
      } catch (error) {
        console.error("Failed to fetch suggestions:", error);
        setSuggestionsError("Unable to load suggestions");
      } finally {
        setSuggestionsLoading(false);
      }
    };

    if (isAuthenticated && keycloak?.token) {
      fetchSuggestions();
    }
  }, [isAuthenticated, keycloak, userRooms]);

  const dmRooms = userRooms.filter((room) => room.id.includes("_"));
  const activeRooms = userRooms.filter((room) => !room.id.includes("_"));

  return (
    <div className="chat-page">
      <div className="chat-area">
        <div className="suggestions">
          <div className="suggestions-header">Direct messages</div>
          <div className="suggestions-list">
            {dmRooms.length === 0 && (
              <div className="suggestion-card">
                <div>
                  <div className="suggestion-name">No direct messages yet</div>
                  <div className="suggestion-meta">
                    Start a conversation from the People list.
                  </div>
                </div>
              </div>
            )}
            {dmRooms.map((room) => {
              const currentUserId = keycloak?.tokenParsed?.sub || "";
              const otherUserId = getOtherUserId(room.id, currentUserId);
              const profile = userProfiles[otherUserId];
              const name = profile?.displayName || "Unknown user";
              return (
                <button
                  key={room.id}
                  className="suggestion-card"
                  onClick={() => handleRoomSelect(room.id)}
                >
                  <div className="suggestion-avatar">
                    {profile?.picture ? (
                      <img
                        src={
                          profile.picture.startsWith("data:")
                            ? profile.picture
                            : `data:image/jpeg;base64,${profile.picture}`
                        }
                        alt={name}
                      />
                    ) : (
                      <span>{name.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div>
                    <div className="suggestion-name">{name}</div>
                    <div className="suggestion-meta">Direct message</div>
                  </div>
                  {unreadRooms[room.id] && (
                    <span className="room-alert" title="Unread messages">
                      !
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="suggestions">
          <div className="suggestions-header">Rooms you are in</div>
          <div className="suggestions-list">
            {activeRooms.length === 0 && (
              <div className="suggestion-card">
                <div>
                  <div className="suggestion-name">No rooms yet</div>
                  <div className="suggestion-meta">
                    Join a room from the suggestions below.
                  </div>
                </div>
              </div>
            )}
            {activeRooms.map((room) => (
              <button
                key={room.id}
                className="suggestion-card"
                onClick={() => handleRoomSelect(room.id)}
              >
                <div className="suggestion-avatar room">
                  {room.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="suggestion-name">{room.name}</div>
                  <div className="suggestion-meta">
                    {room.is_public ? "Public room" : "Private room"}
                  </div>
                </div>
                {unreadRooms[room.id] && (
                  <span className="room-alert" title="Unread messages">
                    !
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="suggestions">
          <div className="suggestions-header">Suggestions</div>
          <div className="suggestions-list">
            {suggestionsLoading && (
              <div className="suggestion-card">
                <div>
                  <div className="suggestion-name">Loading suggestions…</div>
                </div>
              </div>
            )}
            {suggestionsError && (
              <div className="suggestion-card">
                <div>
                  <div className="suggestion-name">{suggestionsError}</div>
                </div>
              </div>
            )}
            {!suggestionsLoading && !suggestionsError && suggestions.length === 0 && (
              <div className="suggestion-card">
                <div>
                  <div className="suggestion-name">No suggestions yet</div>
                </div>
              </div>
            )}
            {!suggestionsLoading &&
              !suggestionsError &&
              suggestions.map((item) => {
                if (item.type === "room") {
                  return (
                    <button
                      key={`room-${item.id}`}
                      className="suggestion-card"
                      onClick={() => handleRoomSelect(item.id)}
                    >
                      <div className="suggestion-avatar room">
                        {item.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="suggestion-name">{item.name}</div>
                        <div className="suggestion-meta">Public room</div>
                      </div>
                    </button>
                  );
                }
                return (
                  <button
                    key={`person-${item.id}`}
                    className="suggestion-card"
                    onClick={() =>
                      handleRoomSelect(
                        buildDmRoomId(
                          keycloak?.tokenParsed?.sub || "",
                          item.id
                        )
                      )
                    }
                  >
                    <div className="suggestion-avatar">
                      {item.picture ? (
                        <img
                          src={
                            item.picture.startsWith("data:")
                              ? item.picture
                              : `data:image/jpeg;base64,${item.picture}`
                          }
                          alt={item.name}
                        />
                      ) : (
                        <span>{item.name.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <div>
                      <div className="suggestion-name">{item.name}</div>
                      <div className="suggestion-meta">Suggested person</div>
                    </div>
                  </button>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default YourChats;

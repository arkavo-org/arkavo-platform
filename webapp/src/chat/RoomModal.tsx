import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ImageEditorModal from '../components/ImageEditorModal';

interface RoomModalProps {
  roomId: string;
  roomInfo: {
    name: string;
    is_public: number;
    creator?: string;
    admins?: string[];
    picture?: string;
  } | null;
  profiles: {[key: string]: {display_name: string, picture: string}};
  onClose: () => void;
  onRoomUpdated: () => void;
}

interface MemberProfile {
  uuid: string;
  display_name: string;
  name?: string;
  picture?: string;
}

interface PeopleOption {
  uuid?: string;
  display_name?: string;
  name?: string;
  picture?: string;
}

const RoomModal: React.FC<RoomModalProps> = ({
  roomId,
  roomInfo,
  profiles,
  onClose,
  onRoomUpdated
}) => {
  const { keycloak } = useAuth();
  const navigate = useNavigate();
  const currentUserId = keycloak?.tokenParsed?.sub;
  const isDmRoom = useMemo(() => roomId.includes("_"), [roomId]);
  const [editedRoomInfo, setEditedRoomInfo] = useState({
    name: roomInfo?.name || '',
    is_public: roomInfo?.is_public || 0,
    picture: roomInfo?.picture || ''
  });
  const [members, setMembers] = useState<MemberProfile[]>([]);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [membersFeedback, setMembersFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [inviteSearch, setInviteSearch] = useState('');
  const [peopleOptions, setPeopleOptions] = useState<PeopleOption[]>([]);
  const [invitingUserId, setInvitingUserId] = useState<string | null>(null);
  const [inviteFeedback, setInviteFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [promotingMemberId, setPromotingMemberId] = useState<string | null>(null);
  const [demotingMemberId, setDemotingMemberId] = useState<string | null>(null);
  const [showImageEditor, setShowImageEditor] = useState(false);
  const [imageToEdit, setImageToEdit] = useState<string | null>(null);
  const [savingImage, setSavingImage] = useState(false);
  const [roomImageError, setRoomImageError] = useState<string | null>(null);
  const isAdmin = Boolean(
    !isDmRoom && roomInfo?.admins?.includes(currentUserId || '')
  );
  const resolveDisplayName = (name?: string) =>
    name && name.trim().length ? name : "Unknown user";
  const [dmActionStatus, setDmActionStatus] = useState<string | null>(null);

  const handleEditChange = (field: string, value: string | number | boolean) => {
    const newValue = field === 'is_public' ? (value ? 1 : 0) : value;
    setEditedRoomInfo(prev => ({
      ...prev,
      [field]: newValue
    }));
  };

  const handleSave = async () => {
    if (!roomInfo || !keycloak?.token) return;
    if (isDmRoom) return;

    try {
      if (keycloak.isTokenExpired()) {
        await keycloak.updateToken(30);
      }

      const response = await fetch(
        `${import.meta.env.VITE_USERS_API_URL}/rooms/${roomId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${keycloak.token}`,
          },
          body: JSON.stringify({
            ...editedRoomInfo,
          }),
        }
      );

      if (response.ok) {
        onRoomUpdated();
        onClose();
      }
    } catch (error) {
      console.error("Error updating room:", error);
    }
  };

  const fetchRoomMembers = async () => {
    if (!keycloak?.token) return;
    try {
      if (keycloak.isTokenExpired()) {
        await keycloak.updateToken(30);
      }

      const response = await fetch(
        `${import.meta.env.VITE_USERS_API_URL}/rooms/${roomId}/members`,
        {
          headers: {
            Authorization: `Bearer ${keycloak.token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setMembers(
          Array.isArray(data.members)
            ? data.members
            : []
        );
        setMembersError(null);
      } else {
        setMembersError('Unable to load room members.');
      }
    } catch (error) {
      console.error('Failed to fetch members:', error);
      setMembersError('Unable to load room members.');
    }
  };

  const fetchPeople = async () => {
    if (!keycloak?.token) return;
    try {
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
        setPeopleOptions(Array.isArray(data.people) ? data.people : []);
      }
    } catch (error) {
      console.error('Failed to fetch people list:', error);
    }
  };

  useEffect(() => {
    setEditedRoomInfo({
      name: roomInfo?.name || '',
      is_public: roomInfo?.is_public || 0,
      picture: roomInfo?.picture || '',
    });
  }, [roomInfo?.name, roomInfo?.is_public, roomInfo?.picture]);

  useEffect(() => {
    fetchRoomMembers();
  }, [roomId, keycloak?.token]);

  useEffect(() => {
    if (isAdmin) {
      fetchPeople();
    }
  }, [isAdmin, keycloak?.token]);

  const otherMember = useMemo(() => {
    if (!isDmRoom || !currentUserId) return null;
    return members.find((member) => member.uuid !== currentUserId) || null;
  }, [members, currentUserId, isDmRoom]);

  const availableInvitees = useMemo(() => {
    if (!peopleOptions.length) return [];
    const memberIds = new Set(members.map((member) => member.uuid));
    const search = inviteSearch.trim().toLowerCase();

    return peopleOptions
      .filter(
        (person): person is PeopleOption & { uuid: string } =>
          typeof person.uuid === 'string' && !memberIds.has(person.uuid)
      )
      .filter((person) => {
        if (!search) return true;
        const text = (
          person.display_name ||
          person.name ||
          person.uuid
        )?.toLowerCase();
        return text?.includes(search);
      })
      .slice(0, 8);
  }, [peopleOptions, members, inviteSearch]);

  const handleInvite = async (userId: string) => {
    if (!keycloak?.token) return;
    setInviteFeedback(null);
    setInvitingUserId(userId);
    try {
      if (keycloak.isTokenExpired()) {
        await keycloak.updateToken(30);
      }

      const response = await fetch(
        `${import.meta.env.VITE_USERS_API_URL}/rooms/${roomId}/invite?user_id=${encodeURIComponent(userId)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${keycloak.token}`,
          },
        }
      );

      if (response.ok) {
        const invitedProfile = peopleOptions.find((person) => person.uuid === userId);
        setMembers((prev) => [
          ...prev,
          {
            uuid: userId,
            display_name:
              invitedProfile?.display_name ||
              invitedProfile?.name ||
              userId,
            name: invitedProfile?.name,
            picture: invitedProfile?.picture,
          },
        ]);
        setInviteFeedback({
          type: 'success',
          text: 'Invitation sent.',
        });
      } else {
        setInviteFeedback({
          type: 'error',
          text: 'Failed to invite user.',
        });
      }
    } catch (error) {
      console.error('Invite error:', error);
      setInviteFeedback({
        type: 'error',
        text: 'Failed to invite user.',
      });
    } finally {
      setInvitingUserId(null);
      setInviteSearch('');
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!keycloak?.token) return;
    setMembersFeedback(null);
    setRemovingMemberId(userId);
    try {
      if (keycloak.isTokenExpired()) {
        await keycloak.updateToken(30);
      }
      const response = await fetch(
        `${import.meta.env.VITE_USERS_API_URL}/rooms/${roomId}/members/${encodeURIComponent(userId)}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${keycloak.token}`,
          },
        }
      );
      if (response.ok) {
        setMembers((prev) => prev.filter((member) => member.uuid !== userId));
        setMembersFeedback({
          type: 'success',
          text: 'Member removed.',
        });
      } else {
        setMembersFeedback({
          type: 'error',
          text: 'Failed to remove member.',
        });
      }
    } catch (error) {
      console.error('Remove member error:', error);
      setMembersFeedback({
        type: 'error',
        text: 'Failed to remove member.',
      });
    } finally {
      setRemovingMemberId(null);
    }
  };

  const handlePromoteMember = async (userId: string) => {
    if (!keycloak?.token) return;
    setMembersFeedback(null);
    setPromotingMemberId(userId);
    try {
      if (keycloak.isTokenExpired()) {
        await keycloak.updateToken(30);
      }
      const response = await fetch(
        `${import.meta.env.VITE_USERS_API_URL}/rooms/${roomId}/admins/${encodeURIComponent(userId)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${keycloak.token}`,
          },
        }
      );
      if (response.ok) {
        setMembersFeedback({
          type: 'success',
          text: 'Member promoted to admin.',
        });
        onRoomUpdated();
      } else {
        setMembersFeedback({
          type: 'error',
          text: 'Failed to promote member.',
        });
      }
    } catch (error) {
      console.error('Promote member error:', error);
      setMembersFeedback({
        type: 'error',
        text: 'Failed to promote member.',
      });
    } finally {
      setPromotingMemberId(null);
    }
  };

  const handleDemoteMember = async (userId: string) => {
    if (!keycloak?.token) return;
    setMembersFeedback(null);
    setDemotingMemberId(userId);
    try {
      if (keycloak.isTokenExpired()) {
        await keycloak.updateToken(30);
      }
      const response = await fetch(
        `${import.meta.env.VITE_USERS_API_URL}/rooms/${roomId}/admins/${encodeURIComponent(userId)}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${keycloak.token}`,
          },
        }
      );
      if (response.ok) {
        setMembersFeedback({
          type: 'success',
          text: 'Member demoted.',
        });
        onRoomUpdated();
      } else {
        setMembersFeedback({
          type: 'error',
          text: 'Failed to demote member.',
        });
      }
    } catch (error) {
      console.error('Demote member error:', error);
      setMembersFeedback({
        type: 'error',
        text: 'Failed to demote member.',
      });
    } finally {
      setDemotingMemberId(null);
    }
  };

  const renderMemberAvatar = (member: MemberProfile) => {
    if (member.picture) {
      const src = member.picture.startsWith('data:')
        ? member.picture
        : `data:image/jpeg;base64,${member.picture}`;
      return <img src={src} alt={member.display_name} />;
    }
    return (
      <div className="member-avatar-fallback">
        {resolveDisplayName(member.display_name).charAt(0).toUpperCase()}
      </div>
    );
  };

  const renderDmSummary = () => {
    if (!otherMember) {
      return (
        <div className="dm-summary">
          <p>Waiting for participant details…</p>
        </div>
      );
    }
    const avatarSrc = otherMember.picture
      ? otherMember.picture.startsWith("data:")
        ? otherMember.picture
        : `data:image/jpeg;base64,${otherMember.picture}`
      : null;
    return (
      <div className="dm-summary">
        <div className="dm-avatar">
          {avatarSrc ? (
            <img src={avatarSrc} alt={otherMember.display_name} />
          ) : (
            <span>{otherMember.display_name.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="dm-details">
          <h3>{resolveDisplayName(otherMember.display_name)}</h3>
          {otherMember.name && otherMember.name !== otherMember.display_name && (
            <p className="dm-secondary">{otherMember.name}</p>
          )}
        </div>
        <div className="dm-actions">
          <button
            type="button"
            className="dm-action danger"
            onClick={handleDeleteDmRoom}
          >
            Leave chat
          </button>
          <button
            type="button"
            className="dm-action"
            onClick={() => handleReportUser(false)}
            disabled={!otherMember?.uuid}
          >
            Report user
          </button>
          <button
            type="button"
            className="dm-action"
            onClick={() => handleBlockUser()}
            disabled={!otherMember?.uuid}
          >
            Block user
          </button>
          <button
            type="button"
            className="dm-action danger"
            onClick={() => handleReportUser(true)}
            disabled={!otherMember?.uuid}
          >
            Report + block
          </button>
          {dmActionStatus && (
            <div className="dm-action-status">{dmActionStatus}</div>
          )}
        </div>
      </div>
    );
  };

  const roomImageBase =
    editedRoomInfo.picture ||
    roomInfo?.picture ||
    (roomInfo as any)?.image ||
    (roomInfo as any)?.room_image ||
    (roomInfo as any)?.photo ||
    (roomInfo as any)?.avatar;
  const roomImageSrc = roomImageBase
    ? roomImageBase.startsWith('data:')
      ? roomImageBase
      : `data:image/jpeg;base64,${roomImageBase}`
    : '/assets/dummy-image.jpg';

  const handleRoomImageSave = async (base64Image: string) => {
    if (!keycloak?.token || !roomInfo || isDmRoom) return;
    setSavingImage(true);
    setRoomImageError(null);
    try {
      if (keycloak.isTokenExpired()) {
        await keycloak.updateToken(30);
      }

      const response = await fetch(
        `${import.meta.env.VITE_USERS_API_URL}/rooms/${roomId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${keycloak.token}`,
          },
          body: JSON.stringify({
            ...editedRoomInfo,
            picture: base64Image,
          }),
        }
      );

      if (response.ok) {
    setEditedRoomInfo((prev) => ({ ...prev, picture: base64Image }));
        onRoomUpdated();
      } else {
        setRoomImageError('Failed to update room photo.');
      }
    } catch (error) {
      console.error('Error updating room photo:', error);
      setRoomImageError('Failed to update room photo.');
    } finally {
      setSavingImage(false);
      setShowImageEditor(false);
    }
  };

  const handleDeleteDmRoom = async () => {
    if (!keycloak?.token || !isDmRoom) return;
    const confirmed = window.confirm("Delete this direct message? This cannot be undone.");
    if (!confirmed) return;
    setDmActionStatus(null);
    try {
      if (keycloak.isTokenExpired()) {
        await keycloak.updateToken(30);
      }
      const response = await fetch(
        `${import.meta.env.VITE_USERS_API_URL}/rooms/${roomId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${keycloak.token}`,
          },
        }
      );
      if (!response.ok) {
        throw new Error("Failed to delete direct message");
      }
      onClose();
      navigate("/chat");
    } catch (error) {
      console.error("Failed to delete direct message:", error);
      setDmActionStatus("Could not delete this conversation.");
    }
  };

  const handleBlockUser = async (silent = false): Promise<boolean> => {
    if (!keycloak?.token || !otherMember?.uuid) return false;
    setDmActionStatus(null);
    try {
      if (keycloak.isTokenExpired()) {
        await keycloak.updateToken(30);
      }
      const response = await fetch(
        `${import.meta.env.VITE_USERS_API_URL}/users/${otherMember.uuid}/block`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${keycloak.token}`,
          },
        }
      );
      if (!response.ok) {
        throw new Error("Failed to block user");
      }
      if (!silent) {
        setDmActionStatus("User blocked.");
      }
      return true;
    } catch (error) {
      console.error("Failed to block user:", error);
      if (!silent) {
        setDmActionStatus("Could not block this user.");
      }
      return false;
    }
  };

  const handleReportUser = async (alsoBlock: boolean) => {
    if (!keycloak?.token || !otherMember?.uuid) return;
    const reason = window.prompt("Report reason (optional):");
    if (reason === null) return;
    setDmActionStatus(null);
    try {
      if (keycloak.isTokenExpired()) {
        await keycloak.updateToken(30);
      }
      const response = await fetch(
        `${import.meta.env.VITE_USERS_API_URL}/users/${otherMember.uuid}/report`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${keycloak.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ room_id: roomId, reason: reason || "" }),
        }
      );
      if (!response.ok) {
        throw new Error("Failed to report user");
      }
      if (alsoBlock) {
        const blocked = await handleBlockUser(true);
        setDmActionStatus(
          blocked
            ? "Report submitted and user blocked."
            : "Report submitted, but blocking failed."
        );
      } else {
        setDmActionStatus("Report submitted.");
      }
    } catch (error) {
      console.error("Failed to report user:", error);
      setDmActionStatus("Could not submit report.");
    }
  };

  const handleImageEditStart = () => {
    if (!isAdmin || isDmRoom) return;
    setImageToEdit(roomImageSrc);
    setShowImageEditor(true);
  };

  const handleOverlayClick = () => {
    if (showImageEditor) return;
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      {showImageEditor && imageToEdit && (
        <ImageEditorModal
          image={imageToEdit}
          onClose={() => setShowImageEditor(false)}
          onSave={handleRoomImageSave}
        />
      )}
      <div 
        className="room-info-modal"
        onClick={e => e.stopPropagation()}
      >
        {!isDmRoom && (
          <div
            className={`room-hero ${isAdmin ? 'editable' : ''}`}
            role={isAdmin ? 'button' : undefined}
            tabIndex={isAdmin ? 0 : -1}
            onClick={handleImageEditStart}
            onKeyDown={(e) => {
              if (!isAdmin) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleImageEditStart();
              }
            }}
            aria-label={isAdmin ? 'Edit room photo' : 'Room photo'}
          >
            <img src={roomImageSrc} alt={roomInfo?.name || 'Room'} />
            {isAdmin && (
              <div className="room-hero-overlay">
                {savingImage ? 'Saving…' : roomImageBase ? 'Edit photo' : 'Add photo'}
              </div>
            )}
          </div>
        )}
        {roomImageError && (
          <div className="room-image-error">{roomImageError}</div>
        )}
        <h2>{isDmRoom ? "Direct Message" : "Room Information"}</h2>
        {isDmRoom ? (
          <>{renderDmSummary()}</>
        ) : isAdmin ? (
          <>
            <div className="room-edit-field">
              <label>Name</label>
              <input
                type="text"
                value={editedRoomInfo.name || ''}
                onChange={(e) => handleEditChange('name', e.target.value)}
                onBlur={handleSave}
              />
            </div>
            <div className="room-edit-field checkbox-row">
              <label className="checkbox-group">
                <input
                  type="checkbox"
                  checked={!!editedRoomInfo.is_public}
                  onChange={(e) => handleEditChange('is_public', e.target.checked)}
                />
                Public Room
              </label>
            </div>
            <div className="room-edit-actions">
              <button onClick={handleSave}>Save Changes</button>
            </div>
          </>
        ) : (
          <>
            <p><strong>Name:</strong> {roomInfo?.name}</p>
            <p><strong>Type:</strong> {roomInfo?.is_public ? 'Public' : 'Private'}</p>
            {roomInfo?.creator && (
              <p><strong>Created by:</strong> {resolveDisplayName(profiles[roomInfo.creator]?.display_name)}</p>
            )}
          </>
        )}
        {!isDmRoom && (
          <div className="admins-section">
            <h3>Admins</h3>
            <ul>
              {roomInfo?.admins?.map(adminId => (
                <li key={adminId}>
                  {resolveDisplayName(profiles[adminId]?.display_name)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!isDmRoom && (
          <>
            <div className="room-members-section">
              <div className="subsection-header">
                <h3>People in this room</h3>
                <span className="count-badge">{members.length}</span>
              </div>
              {membersFeedback && (
                <div className={`members-feedback ${membersFeedback.type}`}>
                  {membersFeedback.text}
                </div>
              )}
              {membersError ? (
                <div className="room-members-empty">{membersError}</div>
              ) : (
                <div className="room-members-list">
                  {members.length ? (
                    members.map((member) => (
                      <div key={member.uuid} className="room-member">
                        <div className="room-member-avatar">
                          {renderMemberAvatar(member)}
                        </div>
                        <div className="room-member-details">
                          <span className="member-name">{resolveDisplayName(member.display_name)}</span>
                        </div>
                        <div className="room-member-actions">
                      {roomInfo?.admins?.includes(member.uuid) && (
                        <span className="member-role-badge">Admin</span>
                      )}
                      {isAdmin &&
                        member.uuid !== keycloak?.tokenParsed?.sub && (
                          <>
                            {roomInfo?.admins?.includes(member.uuid) ? (
                              <button
                                type="button"
                                className="demote-member-button"
                                onClick={() => handleDemoteMember(member.uuid)}
                                disabled={demotingMemberId === member.uuid}
                              >
                                {demotingMemberId === member.uuid
                                  ? 'Demoting...'
                                  : 'Demote'}
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="promote-member-button"
                                onClick={() => handlePromoteMember(member.uuid)}
                                disabled={promotingMemberId === member.uuid}
                              >
                                {promotingMemberId === member.uuid
                                  ? 'Promoting...'
                                  : 'Make admin'}
                              </button>
                            )}
                            <button
                              type="button"
                              className="remove-member-button"
                              onClick={() => handleRemoveMember(member.uuid)}
                              disabled={removingMemberId === member.uuid}
                            >
                              {removingMemberId === member.uuid
                                ? 'Removing...'
                                : 'Remove'}
                            </button>
                          </>
                        )}
                    </div>
                  </div>
                ))
                  ) : (
                    <div className="room-members-empty">No one else is here yet.</div>
                  )}
                </div>
              )}
            </div>

            {isAdmin && (
              <div className="invite-section">
                <div className="subsection-header">
                  <h3>Invite people</h3>
                </div>
                <input
                  type="text"
                  placeholder="Search by name or email"
                  value={inviteSearch}
                  onChange={(e) => setInviteSearch(e.target.value)}
                />
                {inviteFeedback && (
                  <div className={`invite-feedback ${inviteFeedback.type}`}>
                    {inviteFeedback.text}
                  </div>
                )}
                <div className="invite-results">
                  {availableInvitees.length ? (
                    availableInvitees.map((person) => (
                      <div key={person.uuid} className="invite-option">
                        <div className="invite-details">
                          <span className="member-name">
                            {resolveDisplayName(person.display_name || person.name)}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="invite-button"
                          onClick={() => person.uuid && handleInvite(person.uuid)}
                          disabled={invitingUserId === person.uuid}
                        >
                          {invitingUserId === person.uuid ? 'Inviting...' : 'Invite'}
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="room-members-empty">
                      {inviteSearch
                        ? 'No people match that search.'
                        : 'Everyone available is already in this room.'}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
        <button 
          className="room-info-modal-button"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default RoomModal;

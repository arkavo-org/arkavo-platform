# Frontend Files Guide

This file summarizes the main frontend files in `webapp/src` and what each does.

## App Entry
- `webapp/src/main.tsx` - App bootstrap and React root render.
- `webapp/src/App.tsx` - Top-level app shell and global providers.
- `webapp/src/AppRoutes.tsx` - Route definitions and authenticated/unauthenticated flow.

## Navigation and Layout
- `webapp/src/Navbar.tsx` - Main navigation, search, notifications, and browse panel.
- `webapp/src/Sidebar.tsx` - Sidebar layout (legacy or unused in current chat layout).
- `webapp/src/css/Navbar.css` - Navbar and browse panel styling.
- `webapp/src/css/App.css` - App-wide layout and base component styling.
- `webapp/src/css/global.css.default` - Default global styles.
- `webapp/src/css/global.css.template` - Template for generated global styles.

## Auth and Realtime
- `webapp/src/context/AuthContext.tsx` - Auth state, Keycloak integration, login/logout.
- `webapp/src/context/WebSocketContext.tsx` - WebSocket connection and lifecycle.
- `webapp/src/components/AuthProvider.tsx` - Auth provider integration (wrapping logic).
- `webapp/src/components/ConnectionStatus.tsx` - Online/offline indicator.
- `webapp/src/components/ConnectionStatus.css` - Connection status styling.
- `webapp/src/pkceUtils.js` - PKCE helpers for auth flows.
- `webapp/src/pingID.ts` - Ping identity helper (integration-specific).

## Chat and Messaging
- `webapp/src/chat/YourChats.tsx` - Lists active DMs, rooms, and suggestions.
- `webapp/src/chat/Room.tsx` - Room view and message list rendering.
- `webapp/src/chat/Chat.tsx` - Chat view wiring (legacy or alternate view).
- `webapp/src/chat/CreateRoom.tsx` - Create room form and submission.
- `webapp/src/chat/ExploreRooms.tsx` - Public room discovery view.
- `webapp/src/chat/RoomModal.tsx` - Room details modal.
- `webapp/src/chat/MessageInput.tsx` - Message composer.
- `webapp/src/chat/MessageInput.css` - Message composer styling.
- `webapp/src/chat/ChatAuth.ts` - Chat auth helpers.
- `webapp/src/chat/Utils.tsx` - Chat view helpers.
- `webapp/src/chat/indexedDBUtils.ts` - Local message storage helpers.
- `webapp/src/css/ChatPage.css` - Chat layout styling.
- `webapp/src/css/CreateRoom.css` - Create room form styling.
- `webapp/src/css/ExploreRooms.css` - Explore rooms styling.

## Orgs
- `webapp/src/CreateOrg.tsx` - Create organization form.
- `webapp/src/OrgManagement.tsx` - Manage org rooms and events.
- `webapp/src/orgBackendUtils.ts` - Org backend API utilities.

## Feeds and Social
- `webapp/src/Feed.tsx` - Feed container.
- `webapp/src/FeedItem.tsx` - Feed item rendering.
- `webapp/src/css/Feed.css` - Feed styling.
- `webapp/src/css/FeedItem.css` - Feed item styling.
- `webapp/src/Bluesky.tsx` - Bluesky integration UI.
- `webapp/src/useBlueskyIntegration.tsx_` - Inactive/archived Bluesky hook.

## Media and Events
- `webapp/src/VideoFeed.tsx` - Video feed page.
- `webapp/src/css/VideoFeed.css` - Video feed styling.
- `webapp/src/Events.tsx` - Events page.
- `webapp/src/css/Events.css` - Events styling.
- `webapp/src/Promo.tsx` - Marketing/unauthenticated landing.
- `webapp/src/css/Promo.css` - Promo page styling.

## Profiles and Settings
- `webapp/src/Profile.tsx` - Profile editing and settings UI.
- `webapp/src/UserProfile.tsx` - Profile display view.
- `webapp/src/css/Profile.css` - Profile styling.
- `webapp/src/settings.js` - Client settings helpers.
- `webapp/src/Privacy.tsx` - Privacy page.
- `webapp/src/css/Settings.css` - Settings styling.

## Security and TDF
- `webapp/src/TDF.tsx` - TDF-related UI flows.
- `webapp/src/css/TDF.css` - TDF styling.
- `webapp/src/llamaApi.ts` - LLM API wrapper.

## Ballot and API Chat
- `webapp/src/Ballot.tsx` - Ballot UI flow.
- `webapp/src/APIChat.tsx` - API-driven chat UI.

## Type and Interface Helpers
- `webapp/src/Types.ts` - Shared TypeScript types.
- `webapp/src/interface.js` - Shared interface helpers.
- `webapp/src/custom-elements.d.ts` - Custom elements typings.
- `webapp/src/vite-env.d.ts` - Vite env typings.

## Legacy/Archived
- `webapp/src/legacy/*` - Older or experimental components and integrations.
- Files ending with `_` are inactive/archived but kept for reference.

# Chat UX Review (OrgPortal)

## Scope
- Surface reviewed: `https://dev.portal.arkavo.org/chat`
- Focus: first-run experience, room discovery/join flow, empty states, error handling, information architecture, and visual hierarchy.
- Inputs: live screenshot and current implementation in `OrgChatPage.tsx`.

## Summary
The chat foundation is functional and visually consistent with the portal, but the current first-run path has a high drop-off risk: users can successfully authenticate and still see an empty chat with no clear next action. The most urgent issue is that the page provides no guided path from “No joined rooms / No public rooms” to a successful first message.

## Severity-Ordered Findings

### 1. Critical: Empty-state dead end for new users
- Evidence:
  - Left rail shows “No joined rooms.”
  - Discover section shows “No public rooms found.”
  - Main pane says “Select a room” with no fallback action.
- UX impact:
  - New users cannot progress.
  - Perceived as broken even when the backend is healthy.
- Recommendation:
  - Add a primary CTA in empty state: `Create room`.
  - Add secondary CTA: `Refresh rooms`.
  - If org-default rooms are expected, auto-provision/join at least one room (`General`) on first successful session.

### 2. High: Error messaging is too raw and technical
- Evidence:
  - User-facing output currently shows raw payload text like `{ "detail": "Not Found" }`.
- UX impact:
  - Low trust, high confusion.
  - Users cannot distinguish transient auth issues vs routing issues vs no access.
- Recommendation:
  - Map backend errors to human-friendly states:
    - `401`: “Your session expired. Please sign in again.”
    - `403`: “You don’t have permission to access chat yet.”
    - `404` during bootstrap: “Chat is temporarily unavailable. Try again in a moment.”
    - `5xx`: “Chat service is currently unavailable.”
  - Keep raw diagnostic text behind a collapsible `Show technical details` (DevTools-only).

### 3. High: “Connect Chat” flow lacks progression feedback
- Evidence:
  - Button changes to “Redirecting...” but no recovery guidance if callback fails.
- UX impact:
  - Users can get stuck between auth hops without knowing next steps.
- Recommendation:
  - Add staged status messages:
    - `Connecting to chat provider...`
    - `Verifying your room access...`
    - `Loading conversations...`
  - Add timeout fallback after ~10s with retry + “Return to home” link.

### 4. Medium: Main content area is underutilized in no-room state
- Evidence:
  - Large empty pane with only two lines of text.
- UX impact:
  - Low information density, unclear affordance.
- Recommendation:
  - Replace with structured onboarding card:
    - “Start here” steps (Join a room / Create room / Invite teammate).
    - Quick actions buttons.
    - Short explanation of what rooms are.

### 5. Medium: Discover list affordance could be clearer
- Evidence:
  - Discover cards show room name + generic “Join room” text.
- UX impact:
  - Users cannot evaluate which room to join.
- Recommendation:
  - Show per-room metadata where available:
    - member count, topic snippet, visibility badge (`Public`, `Org`, `Private`).
  - Change CTA label to `Join` and include state (`Joined`, `Request access`).

### 6. Medium: Header-level context does not indicate chat account/session state
- Evidence:
  - User appears logged in to portal; chat may still be disconnected.
- UX impact:
  - Confusing separation between portal auth and chat auth.
- Recommendation:
  - Add small status pill near chat header:
    - `Chat connected` / `Chat disconnected` / `Reconnecting`.

### 7. Low: Terminology and copy can be simplified
- Evidence:
  - “Automatic sign-in was unavailable. Connect Matrix manually.”
- UX impact:
  - “Matrix” may be unfamiliar to non-technical users.
- Recommendation:
  - Prefer product-language first:
    - “We couldn’t connect chat automatically.”
    - Primary CTA: `Connect Chat`.
    - Optional subtext: “Powered by Matrix” (small text).

## Recommended UX Improvements (Phased)

### Phase 1 (Immediate)
1. Add no-room onboarding module with `Create room` + `Refresh` CTAs.
2. Replace raw JSON errors with friendly message mapping.
3. Add retry/timeout states to Connect flow.

### Phase 2 (Near-term)
1. Auto-create or auto-join one default org room after first chat bootstrap.
2. Add room metadata in Discover list.
3. Add chat connection status indicator in chat header.

### Phase 3 (Polish)
1. Persist last visited room and open directly on return.
2. Improve skeleton/loading states for room list and timeline.
3. Add empty-timeline starter prompts (“Say hello”, “Share update”).

## Success Metrics
- Time to first message (new user) < 90 seconds.
- Chat-page bounce rate reduction (no action taken) by 40%.
- Error-to-recovery rate (failed connect -> successful connect) > 80%.

## QA Checklist for Updated UX
- New user with zero rooms can reach a sendable room in <= 3 clicks.
- Expired auth token shows friendly recovery message.
- Discover list renders with metadata and join states.
- Connect retry works after transient backend/Synapse outage.
- Mobile view preserves CTA visibility without hidden actions.

# Integration Guide — Full User Journey

This guide shows exactly how the REST API and the two WebSocket namespaces connect into a single user flow. Use it as a reference when building the frontend for the first time.

---

## Prerequisites

- Server running on `http://localhost:8000` (see [SETUP.md](./SETUP.md))
- REST docs at `http://localhost:8000/docs`
- Chat WS docs: [CHAT_WEBSOCKET_GUIDE.md](./CHAT_WEBSOCKET_GUIDE.md)
- Presence WS docs: [PRESENCE_WEBSOCKET_GUIDE.md](./PRESENCE_WEBSOCKET_GUIDE.md)

---

## Step 1 — Register and log in

```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "firstName": "Alice",
  "lastName": "Smith",
  "email": "alice@example.com",
  "password": "Password123!",
  "gender": "FEMALE",
  "birthDate": "1998-05-20",
  "bio": "Coffee lover and night owl."
}
```

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "alice@example.com",
  "password": "Password123!"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "user": { "id": "abc123", ... }
  }
}
```

Save `accessToken`. It is used as a Bearer token for REST requests and as the WebSocket auth token. It expires after the configured `JWT_ACCESS_EXPIRATION` (default 15 minutes) — refresh it with `POST /api/v1/auth/refresh-token` before it expires.

---

## Step 2 — Check in to a venue

The user must physically be at a venue. The app passes their GPS coordinates; the server checks them against the venue's geofence radius.

```http
POST /api/v1/venues/:venueId/checkin
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "latitude": 51.5074,
  "longitude": -0.1278
}
```

A successful check-in stores the `userId → venueId` mapping in Redis. This is required for the presence WebSocket connection in the next step.

---

## Step 3 — Connect to `/presence`

```typescript
import { io } from 'socket.io-client';

const presence = io('http://localhost:8000/presence', {
  auth: { token: accessToken },
  transports: ['websocket'],
});

// Immediately fires after connect — no manual request needed
presence.on('feed_initial', ({ users }) => {
  renderFeed(users); // users filtered by your preference settings
});

// Another user joins the venue
presence.on('user_joined', ({ user }) => {
  appendToFeed(user);
});

// A user leaves the venue (after 30-second grace period)
presence.on('user_left', ({ userId }) => {
  removeFromFeed(userId);
});

// Keep the Redis presence alive
setInterval(() => presence.emit('heartbeat', {}), 30_000);
```

The server rejects the connection if the user is not checked in (no entry in Redis). Always complete step 2 first.

---

## Step 4 — Set preferences (if not set yet)

Preferences control who appears in each user's discovery feed. Without preferences, the feed uses defaults.

```http
POST /api/v1/preferences
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "minAge": 22,
  "maxAge": 35,
  "preferredGender": "MALE",
  "lookingFor": ["COFFEE_CHAT", "FRIENDSHIP"]
}
```

---

## Step 5 — Like someone

```http
POST /api/v1/interactions/like
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "targetUserId": "def456",
  "venueId": "venue789"
}
```

**Response when no mutual like yet:**

```json
{
  "success": true,
  "data": { "matched": false }
}
```

**Response when mutual like (match):**

```json
{
  "success": true,
  "data": {
    "matched": true,
    "chatSession": {
      "id": "session-xyz",
      "expiresAt": "2026-05-02T13:40:00.000Z",
      "partner": { "id": "def456", "firstName": "Bob", ... }
    }
  }
}
```

When `matched: true`, both users receive the `chatSession.id`. Use it to connect to `/chat`.

---

## Step 6 — Connect to `/chat` and start messaging

```typescript
const chat = io('http://localhost:8000/chat', {
  auth: { token: accessToken },
  transports: ['websocket'],
});

// On connect the server auto-joins any active session.
// Manually join if you need to be explicit:
chat.emit('join_chat', { chatSessionId: 'session-xyz' });

chat.on('chat_joined', ({ messages, session }) => {
  renderChatHistory(messages);
  renderPartnerInfo(session.partner);
});

chat.on('message', msg => {
  appendMessage(msg);
});

chat.on('partner_typing', ({ isTyping }) => {
  showTypingIndicator(isTyping);
});

// Warn before the 10-minute session expires
chat.on('session_ending_soon', ({ minutesLeft }) => {
  showBanner(`Chat ends in ${minutesLeft} minute(s)`);
});

chat.on('chat_ended', () => {
  showSessionEndScreen();
});

// Send a message
chat.emit('send_message', {
  chatSessionId: 'session-xyz',
  content: 'Hey! Nice to meet you here.',
});

// Typing indicator
chat.emit('typing', { chatSessionId: 'session-xyz', isTyping: true });
```

The chat session lasts **10 minutes** from the moment it is created. After that the server marks it `EXPIRED` and neither user can send messages.

---

## Step 7 — Check out

```http
POST /api/v1/venues/:venueId/checkout
Authorization: Bearer <accessToken>
```

This removes the user from the venue presence set in Redis. When the `/presence` socket disconnects (or the user manually checks out), the server waits 30 seconds before broadcasting `user_left` to the venue room in case it was a temporary drop.

---

## Token refresh flow

Access tokens are short-lived. The refresh token (stored in an httpOnly cookie) can issue a new access token:

```http
POST /api/v1/auth/refresh-token
```

The browser sends the cookie automatically. The response contains a new `accessToken`. Update your socket auth and re-connect if the current socket was rejected:

```typescript
presence.on('connect_error', async err => {
  if (err.message.includes('expired')) {
    const res = await fetch('/api/v1/auth/refresh-token', { method: 'POST' });
    const { data } = await res.json();
    presence.auth = { token: data.accessToken };
    presence.connect();
  }
});
```

---

## Complete state machine

```
[Unauthenticated]
    │ register / login
    ▼
[Authenticated]
    │ POST /venues/:id/checkin
    ▼
[Checked in]
    │ connect /presence
    ▼
[In venue feed]  ←──── user_joined / user_left events ────►
    │ POST /interactions/like + mutual like
    ▼
[Matched]
    │ connect /chat
    ▼
[In 10-min chat] ←── message / typing events ────►
    │ chat_ended / session expires
    ▼
[Chat over]
    │ POST /venues/:id/checkout (or disconnect /presence)
    ▼
[Checked out]
```

---

## Common mistakes

| Mistake                                              | Symptom                                                    | Fix                                                                         |
| ---------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| Connecting to `/presence` before check-in            | `"Not checked in. Please check in first."` then disconnect | Call `POST /venues/:id/checkin` before connecting the socket                |
| Using an expired access token for WS                 | `connect_error: invalid or expired token`                  | Refresh token before (re)connecting                                         |
| Not joining a chat room with `join_chat`             | No `message` events received                               | Emit `join_chat` with the `chatSessionId` after connecting                  |
| Sending heartbeat faster than needed                 | Approaching rate limit                                     | Once every 30 s is more than sufficient                                     |
| Building a chat UI before confirming `matched: true` | Trying to connect to a non-existent session                | Only connect `/chat` after receiving `matched: true` from the like endpoint |

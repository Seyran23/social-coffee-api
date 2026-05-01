# Presence WebSocket Guide

The `/presence` namespace keeps track of who is physically at a venue right now. It powers the discovery feed — the list of people you can like — and broadcasts real-time join/leave events so the UI stays in sync without polling.

---

## Table of Contents

1. [How it fits into the app flow](#how-it-fits-into-the-app-flow)
2. [Connecting](#connecting)
3. [Authentication](#authentication)
4. [Events — Client → Server](#events--client--server)
5. [Events — Server → Client](#events--server--client)
6. [Connection lifecycle](#connection-lifecycle)
7. [Reconnection and grace period](#reconnection-and-grace-period)
8. [Heartbeat and geofence](#heartbeat-and-geofence)
9. [Rate limits](#rate-limits)
10. [Error reference](#error-reference)
11. [TypeScript types](#typescript-types)
12. [Code example](#code-example)

---

## How it fits into the app flow

```
1. User registers / logs in          → REST  POST /api/v1/auth/login
2. User checks in to a venue         → REST  POST /api/v1/venues/:id/checkin
3. User connects to /presence        → WebSocket (this guide)
   ↳ Server sends initial feed
   ↳ Server broadcasts user_joined to venue room
4. User likes someone                → REST  POST /api/v1/interactions/like
   ↳ If mutual match → ChatSession created
5. User connects to /chat            → WebSocket (see CHAT_WEBSOCKET_GUIDE.md)
6. User leaves / app closes          → disconnect
   ↳ 30-second grace period before user_left broadcast
```

A user **must be checked in** (step 2) before the presence connection (step 3) is accepted. The server reads the check-in from Redis on every new connection.

---

## Connecting

**Namespace URL:**

```
ws://localhost:8000/presence
```

**socket.io-client:**

```typescript
import { io, Socket } from 'socket.io-client';

const socket = io('http://localhost:8000/presence', {
  auth: { token: accessToken },
  transports: ['websocket'],
  autoConnect: false,
});

socket.connect();
```

---

## Authentication

Pass the JWT access token obtained from `POST /api/v1/auth/login` in **one** of these three ways (in priority order):

| Method                                | How to set it                   |
| ------------------------------------- | ------------------------------- |
| Handshake auth object _(recommended)_ | `{ auth: { token: 'eyJ...' } }` |
| Query parameter                       | `?token=eyJ...`                 |
| Authorization header                  | `Authorization: Bearer eyJ...`  |

The handshake auth object is the most reliable across environments. Query parameters end up in server logs — avoid them in production.

**If the token is missing or invalid:** the connection is rejected and the `connect_error` event fires on the client.

---

## Events — Client → Server

### `heartbeat`

Keep the user's Redis presence entry alive and optionally re-validate the geofence.

**Payload:** _(all fields optional)_

```typescript
{
  latitude?: number;   // current device latitude
  longitude?: number;  // current device longitude
}
```

**Recommended cadence:** every 30 seconds. Send coordinates every 60–120 seconds to save battery; heartbeats without coordinates still refresh the session and are very cheap.

**Server replies with:** [`heartbeat_ack`](#heartbeat_ack)

If coordinates are provided and the user has moved outside the venue's geofence radius, the server emits [`error`](#error) with message `"You have left the venue. You have been checked out."` and disconnects the socket.

---

## Events — Server → Client

### `feed_initial`

Sent **automatically on connection** — no need to request it.

```typescript
{
  users: UserProfile[];  // users at the same venue filtered by your preferences
  timestamp: number;     // Date.now()
}
```

`UserProfile` shape:

```typescript
interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  age: number;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  bio: string;
  profileImageUrl: string | null;
  interests: Array<{ id: string; name: string }>;
  lookingFor: LookingFor[];
  preference: {
    minAge: number;
    maxAge: number;
    preferredGender: 'MALE' | 'FEMALE' | 'OTHER';
    lookingFor: LookingFor[];
  } | null;
}
```

The feed only includes users who match your preference criteria (age range, preferred gender). It excludes users you have already liked.

---

### `user_joined`

Broadcast to the venue room when **another** user connects (you do not receive this for your own connection).

```typescript
{
  user: UserProfile; // the user who just joined
  timestamp: number;
}
```

Use this to append the new profile to your feed UI without a full refresh.

---

### `user_left`

Broadcast to the venue room when a user's grace period expires after disconnecting (see [Grace period](#reconnection-and-grace-period)).

```typescript
{
  userId: string; // the user who left
  timestamp: number;
}
```

Use this to remove that profile from your feed UI.

---

### `heartbeat_ack`

Reply to a `heartbeat` event. Confirms the heartbeat was processed.

```typescript
{
  timestamp: number; // Date.now() at time of acknowledgement
}
```

---

### `error`

Emitted for connection errors or mid-session errors.

```typescript
{
  message: string;
}
```

See [Error reference](#error-reference) for all possible messages.

---

## Connection lifecycle

```
Client                              Server
  │                                    │
  │─── connect (auth token) ──────────►│
  │                                    │  validate JWT
  │                                    │  check Redis: is user checked in?
  │◄── connect_error ─────────────────│  (if not checked in or bad token)
  │                                    │
  │                                    │  cancel any existing grace timer
  │                                    │  update heartbeat in Redis
  │                                    │  join venue room
  │◄── feed_initial ───────────────────│  send filtered profile feed
  │                                    │  emit user_joined to rest of venue
  │                                    │
  │─── heartbeat ─────────────────────►│
  │◄── heartbeat_ack ──────────────────│
  │                                    │
  │─── disconnect ────────────────────►│
  │                                    │  start 30-second grace timer
  │                                    │  (timer cancelled if reconnect)
  │                                    │
  │          ... 30 seconds ...        │
  │                                    │  emit user_left to venue room
  │                                    │  remove from Redis venue set
```

---

## Reconnection and grace period

When the socket disconnects (network blip, tab hidden, etc.) the server starts a **30-second grace period** before broadcasting `user_left`. If the client reconnects within 30 seconds, the timer is cancelled silently — other users never see a join/leave flicker.

Socket.io's built-in reconnection handles this automatically. Configure it to match:

```typescript
const socket = io('http://localhost:8000/presence', {
  auth: { token: accessToken },
  transports: ['websocket'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 10,
});
```

If the access token expires during a session, reconnection will fail with `connect_error`. Refresh the token before the socket reconnects:

```typescript
socket.on('connect_error', async err => {
  if (err.message.includes('expired') || err.message.includes('invalid')) {
    const newToken = await refreshAccessToken();
    socket.auth = { token: newToken };
    socket.connect();
  }
});
```

---

## Heartbeat and geofence

The heartbeat serves two purposes:

1. **Session keepalive** — Redis presence keys have a TTL. Sending a heartbeat resets the TTL and keeps the user "active".
2. **Geofence re-validation** — If you include coordinates, the server measures the distance to the venue center. If the user is outside `venue.geofenceMeters` (default 150 m), they are automatically checked out and disconnected.

**Recommended pattern:**

```typescript
// Heartbeat every 30 seconds, coordinates every 2 minutes
let heartbeatCount = 0;

setInterval(() => {
  heartbeatCount++;

  const includeCoords = heartbeatCount % 4 === 0; // every 4th tick = 2 min
  const payload =
    includeCoords && coords
      ? { latitude: coords.lat, longitude: coords.lon }
      : {};

  socket.emit('heartbeat', payload);
}, 30_000);
```

Always stop the interval when the socket disconnects:

```typescript
socket.on('disconnect', () => clearInterval(heartbeatInterval));
```

---

## Rate limits

| Scope              | Limit       | Window     | Behaviour on exceed                                     |
| ------------------ | ----------- | ---------- | ------------------------------------------------------- |
| Connections per IP | 10 attempts | 60 seconds | connection rejected with error message                  |
| Events per user    | 100 events  | 60 seconds | `error` event: "Rate limit exceeded. Please slow down!" |

The heartbeat counts toward the event rate limit. At one heartbeat per 30 seconds, that is 2 heartbeats per minute — well within the 100-event window.

---

## Error reference

| Message                                                           | When it happens                    | What to do                                        |
| ----------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------- |
| `"Authentication token required"`                                 | No token in handshake              | Add token to auth object                          |
| `"Invalid or expired token"`                                      | Bad or expired JWT                 | Refresh access token and reconnect                |
| `"Not checked in. Please check in first."`                        | No check-in in Redis               | Call `POST /api/v1/venues/:id/checkin` first      |
| `"You have left the venue. You have been checked out."`           | Geofence violation on heartbeat    | User physically left the venue — show checkout UI |
| `"Too many connection attempts. Please try again in 60 seconds."` | Connection rate limit              | Wait 60 seconds                                   |
| `"Rate limit exceeded. Please slow down!"`                        | Event rate limit                   | Reduce heartbeat / event frequency                |
| `"Failed to load initial feed"`                                   | Internal server error on feed load | Retry connection                                  |

---

## TypeScript types

Copy these into your frontend project:

```typescript
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

export type LookingFor =
  | 'ROMANTIC_RELATIONSHIP'
  | 'CASUAL_DATING'
  | 'FRIENDSHIP'
  | 'NETWORKING'
  | 'ACTIVITY_PARTNER'
  | 'STUDY_BUDDY'
  | 'LANGUAGE_EXCHANGE'
  | 'COFFEE_CHAT'
  | 'EVENTS_COMPANION';

export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  age: number;
  gender: Gender;
  bio: string;
  profileImageUrl: string | null;
  interests: Array<{ id: string; name: string }>;
  lookingFor: LookingFor[];
  preference: {
    minAge: number;
    maxAge: number;
    preferredGender: Gender;
    lookingFor: LookingFor[];
  } | null;
}

// Events: Server → Client
export interface FeedInitialPayload {
  users: UserProfile[];
  timestamp: number;
}

export interface UserJoinedPayload {
  user: UserProfile;
  timestamp: number;
}

export interface UserLeftPayload {
  userId: string;
  timestamp: number;
}

export interface HeartbeatAckPayload {
  timestamp: number;
}

export interface PresenceErrorPayload {
  message: string;
}

// Events: Client → Server
export interface HeartbeatPayload {
  latitude?: number;
  longitude?: number;
}
```

---

## Code example

A minimal React hook that connects to the presence namespace and manages the venue feed:

```typescript
import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type {
  FeedInitialPayload,
  UserJoinedPayload,
  UserLeftPayload,
  UserProfile,
} from './presence.types';

const PRESENCE_URL = 'http://localhost:8000/presence';

export function usePresence(accessToken: string | null) {
  const [feed, setFeed] = useState<UserProfile[]>([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    const socket = io(PRESENCE_URL, {
      auth: { token: accessToken },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);

      // Start heartbeat
      let tick = 0;
      heartbeatRef.current = setInterval(() => {
        tick++;
        // Send coordinates every 4th tick (2 min) — adjust to your needs
        socket.emit('heartbeat', {});
      }, 30_000);
    });

    socket.on('disconnect', () => {
      setConnected(false);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    });

    socket.on('connect_error', async err => {
      console.error('Presence connection error:', err.message);
      // Token refresh logic goes here
    });

    socket.on('feed_initial', ({ users }: FeedInitialPayload) => {
      setFeed(users);
    });

    socket.on('user_joined', ({ user }: UserJoinedPayload) => {
      setFeed(prev => {
        // Avoid duplicates if the user was already in the list
        if (prev.some(u => u.id === user.id)) return prev;
        return [...prev, user];
      });
    });

    socket.on('user_left', ({ userId }: UserLeftPayload) => {
      setFeed(prev => prev.filter(u => u.id !== userId));
    });

    socket.on('error', ({ message }: { message: string }) => {
      console.error('Presence error:', message);
      // Show UI toast / auto-checkout screen based on message
    });

    socket.connect();

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      socket.disconnect();
    };
  }, [accessToken]);

  return { feed, connected };
}
```

---

## See also

- [Chat WebSocket Guide](./CHAT_WEBSOCKET_GUIDE.md) — real-time messaging after a match
- [Integration Guide](./INTEGRATION_GUIDE.md) — full end-to-end user journey
- REST API — available at `http://localhost:8000/docs` when the server is running

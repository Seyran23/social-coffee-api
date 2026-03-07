# WebSocket Chat Module - Complete Guide

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Setup](#setup)
5. [Authentication](#authentication)
6. [WebSocket Events](#websocket-events)
7. [Testing with Postman](#testing-with-postman)
8. [Error Handling](#error-handling)
9. [Rate Limiting](#rate-limiting)
10. [Redis Caching](#redis-caching)

---

## Overview

The Chat module provides real-time WebSocket-based chat functionality using Socket.IO. It enables matched users to communicate in real-time within venue contexts.

### Features
- ✅ JWT-based authentication
- ✅ Real-time bidirectional messaging
- ✅ Typing indicators
- ✅ Auto-reconnection with session restoration
- ✅ Message history (last 50 messages cached)
- ✅ Chat expiration warnings
- ✅ Automatic cleanup of expired chats
- ✅ Rate limiting (connection & event-based)
- ✅ Partner presence notifications

---

## Architecture

### Components

**ChatGateway** (`src/modules/chat/chat.gateway.ts`)
- Handles WebSocket connections
- Manages Socket.IO events
- Applies authentication & rate limiting middleware

**ChatService** (`src/modules/chat/chat.service.ts`)
- Business logic for chat operations
- Database interactions via Prisma
- Message persistence

**RedisService** (`src/modules/redis/redis.service.ts`)
- Session management
- Message caching
- Socket ID mapping
- Rate limiting

### Tech Stack
- **NestJS** - Framework
- **Socket.IO** - WebSocket library
- **Redis** - Caching & session storage
- **PostgreSQL** - Persistent storage
- **Prisma** - ORM

---

## Prerequisites

### 1. Environment Variables

Ensure your `.env` file contains:

```env
PORT=8000
NODE_ENV=development

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/social-coffee?schema=public"

# JWT
JWT_ACCESS_SECRET="your-secret-here"
JWT_ACCESS_EXPIRATION="15m"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# CORS
CLIENT_URL='http://localhost:3000'
CORS_ORIGIN='http://localhost:3000'
```

### 2. Running Services

**Start Redis:**
```bash
redis-server
```

**Start PostgreSQL:**
```bash
# Make sure PostgreSQL is running
pg_ctl status
```

**Start the application:**
```bash
npm run start:dev
```

### 3. Database Schema

The chat module uses these Prisma models:

```prisma
model ChatSession {
  id        String            @id @default(cuid())
  venueId   String
  user1Id   String?
  user2Id   String?
  status    ChatSessionStatus @default(PENDING)
  startedAt DateTime?
  expiresAt DateTime?
  createdAt DateTime          @default(now())
  updatedAt DateTime          @updatedAt

  venue    Venue     @relation(fields: [venueId], references: [id])
  user1    User?     @relation("User1Sessions", fields: [user1Id], references: [id])
  user2    User?     @relation("User2Sessions", fields: [user2Id], references: [id])
  messages Message[]
}

model Message {
  id            String   @id @default(cuid())
  chatSessionId String
  senderId      String
  content       String   @db.Text
  createdAt     DateTime @default(now())

  chatSession ChatSession @relation(fields: [chatSessionId], references: [id])
  sender      User        @relation(fields: [senderId], references: [id])
}

enum ChatSessionStatus {
  PENDING
  ACTIVE
  ENDED
  EXPIRED
}
```

---

## Setup

### Creating a Test Chat Session

For testing purposes, you need to create an ACTIVE chat session in the database:

**Option 1: Using SQL**
```sql
-- Get user IDs
SELECT id, email FROM users LIMIT 2;

-- Get venue ID
SELECT id, name FROM venues LIMIT 1;

-- Create chat session
INSERT INTO chat_sessions (
  id,
  venue_id,
  user1_id,
  user2_id,
  status,
  started_at,
  expires_at,
  created_at,
  updated_at
) VALUES (
  'test-chat-123',              -- Simple ID for testing
  'YOUR_VENUE_ID',              -- Replace with actual venue ID
  'USER_1_ID',                  -- Replace with first user ID
  'USER_2_ID',                  -- Replace with second user ID
  'ACTIVE',                     -- Must be ACTIVE to chat
  NOW(),
  NOW() + INTERVAL '30 minutes',
  NOW(),
  NOW()
);
```

**Option 2: Using Prisma Studio**
```bash
npx prisma studio
```
Navigate to `ChatSession` model and create a record with `status = 'ACTIVE'`.

---

## Authentication

The WebSocket gateway uses JWT-based authentication via middleware.

### How It Works

1. Client connects with JWT token
2. Middleware validates token
3. User data attached to socket
4. Connection accepted or rejected

### Token Extraction Priority

The middleware looks for tokens in this order:

1. **Handshake Auth** (Recommended)
   ```javascript
   socket.auth.token = "YOUR_JWT_TOKEN"
   ```

2. **Query Parameter**
   ```
   ws://localhost:8000/chat?token=YOUR_JWT_TOKEN
   ```

3. **Authorization Header**
   ```
   Authorization: Bearer YOUR_JWT_TOKEN
   ```

### Getting a JWT Token

**HTTP Request:**
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "...",
    "user": {
      "id": "user-id",
      "email": "user@example.com"
    }
  }
}
```

Save the `accessToken` for WebSocket authentication.

---

## WebSocket Events

### Connection URL

```
ws://localhost:8000/chat
```

### Client → Server Events

#### 1. **join_chat**
Join a specific chat room and retrieve message history.

**Payload:**
```json
{
  "chatSessionId": "test-chat-123"
}
```

**Response:** `chat_joined` event

**Errors:**
- `NOT_PARTICIPANT` - User is not part of this chat
- `CHAT_NOT_FOUND` - Chat session doesn't exist

---

#### 2. **send_message**
Send a message in the chat.

**Payload:**
```json
{
  "chatSessionId": "test-chat-123",
  "content": "Hello! How are you?"
}
```

**Validation:**
- `content`: 1-500 characters
- `chatSessionId`: Valid UUID

**Rate Limit:** 60 messages per minute

**Response:** `message` event (broadcast to all participants)

**Errors:**
- `CHAT_NOT_FOUND` - Chat doesn't exist
- `CHAT_ALREADY_ENDED` - Chat has ended
- `CHAT_EXPIRED` - Chat session expired
- Rate limit exceeded

---

#### 3. **typing**
Send typing indicator to partner.

**Payload:**
```json
{
  "chatSessionId": "test-chat-123",
  "isTyping": true
}
```

**Response:** `partner_typing` event (to partner only, not sender)

---

#### 4. **end_chat**
End the chat session.

**Payload:**
```json
{
  "chatSessionId": "test-chat-123"
}
```

**Response:** `chat_ended` event (broadcast to all participants)

**Effects:**
- Updates session status to `ENDED`
- Cleans up Redis cache
- Removes user session mappings

---

### Server → Client Events

#### 1. **chat_joined**
Emitted when successfully joined a chat.

**Payload:**
```json
{
  "chatSessionId": "test-chat-123",
  "messages": [
    {
      "id": "msg-1",
      "chatSessionId": "test-chat-123",
      "senderId": "user-1",
      "content": "Previous message",
      "createdAt": "2025-11-07T14:30:00.000Z"
    }
  ],
  "session": {
    "id": "test-chat-123",
    "user1": {
      "id": "user-1",
      "firstName": "John",
      "lastName": "Doe"
    },
    "user2": {
      "id": "user-2",
      "firstName": "Jane",
      "lastName": "Smith"
    },
    "venue": {
      "id": "venue-1",
      "name": "Starbucks Reserve"
    },
    "status": "ACTIVE",
    "startedAt": "2025-11-07T14:00:00.000Z",
    "expiresAt": "2025-11-07T14:30:00.000Z"
  },
  "reconnected": false,
  "timestamp": 1699368000000
}
```

---

#### 2. **message**
New message received.

**Payload:**
```json
{
  "id": "msg-123",
  "chatSessionId": "test-chat-123",
  "senderId": "user-1",
  "content": "Hello there!",
  "createdAt": "2025-11-07T14:35:00.000Z"
}
```

**Broadcast:** All participants in the chat room

---

#### 3. **partner_typing**
Partner is typing.

**Payload:**
```json
{
  "isTyping": true,
  "userId": "user-2"
}
```

**Recipient:** Partner only (not the sender)

---

#### 4. **chat_ended**
Chat session has ended.

**Payload:**
```json
{
  "chatSessionId": "test-chat-123",
  "endedBy": "user-1",
  "message": "Chat session ended successfully",
  "timestamp": 1699368000000
}
```

**Broadcast:** All participants

---

#### 5. **session_ending_soon**
Warning about upcoming chat expiration.

**Payload:**
```json
{
  "chatSessionId": "test-chat-123",
  "minutesLeft": 5,
  "message": "Your chat will expire in 5 minute(s)",
  "timestamp": 1699368000000
}
```

**Trigger:** Sent when chat has less than 5 minutes remaining (checked every minute)

---

#### 6. **partner_left**
Partner disconnected from chat.

**Payload:**
```json
{
  "message": "Your chat partner has left",
  "userId": "user-2",
  "timestamp": 1699368000000
}
```

---

#### 7. **error**
Error occurred during operation.

**Payload:**
```json
{
  "message": "Error description here"
}
```

**Common Errors:**
- `Authentication token required`
- `You are not a participant in this chat`
- `Chat session has expired`
- `Rate limit exceeded. Slow down!`

---

## Testing with Postman

### Step 1: Setup Authentication

1. **Login to get JWT token**

   ```http
   POST http://localhost:8000/api/auth/login
   Content-Type: application/json

   {
     "email": "user1@example.com",
     "password": "password123"
   }
   ```

2. **Copy the `accessToken` from response**

### Step 2: Create Chat Session

Run this SQL in your database:

```sql
INSERT INTO chat_sessions (
  id, venue_id, user1_id, user2_id, status,
  started_at, expires_at, created_at, updated_at
) VALUES (
  'test-chat-123',
  (SELECT id FROM venues LIMIT 1),
  (SELECT id FROM users WHERE email = 'user1@example.com'),
  (SELECT id FROM users WHERE email = 'user2@example.com'),
  'ACTIVE',
  NOW(),
  NOW() + INTERVAL '30 minutes',
  NOW(),
  NOW()
);
```

### Step 3: Connect to WebSocket

1. **Create WebSocket Request in Postman**
2. **URL:** `ws://localhost:8000/chat`
3. **Add Authentication:**
   - Click "Headers" tab
   - Add header:
     - Key: `Authorization`
     - Value: `Bearer YOUR_JWT_TOKEN`
4. **Click "Connect"**

**Expected Response:**
```
Connected to ws://localhost:8000/chat
```

You should see a `chat_joined` event if you have an active session.

### Step 4: Send Messages

**Format:** Socket.IO uses array format: `[event_name, data]`

#### Join Chat:
```json
["join_chat", {"chatSessionId": "test-chat-123"}]
```

#### Send Message:
```json
["send_message", {"chatSessionId": "test-chat-123", "content": "Hello!"}]
```

#### Start Typing:
```json
["typing", {"chatSessionId": "test-chat-123", "isTyping": true}]
```

#### Stop Typing:
```json
["typing", {"chatSessionId": "test-chat-123", "isTyping": false}]
```

#### End Chat:
```json
["end_chat", {"chatSessionId": "test-chat-123"}]
```

### Step 5: Testing with Two Users

**User 1 Window:**
1. Connect with User 1's JWT token
2. Join chat: `["join_chat", {"chatSessionId": "test-chat-123"}]`
3. Send message: `["send_message", {"chatSessionId": "test-chat-123", "content": "Hi from User 1"}]`

**User 2 Window:**
1. Open new WebSocket tab
2. Connect with User 2's JWT token
3. Join same chat: `["join_chat", {"chatSessionId": "test-chat-123"}]`
4. You should receive User 1's message

**Test Real-time Features:**
- User 1 types → User 2 sees typing indicator
- User 2 sends message → User 1 receives it instantly
- User 1 ends chat → Both receive `chat_ended` event

---

## Error Handling

### Connection Errors

**Error: `Could not connect to ws://localhost:8000/chat`**
- **Cause:** Server not running or wrong port
- **Solution:** Check server is running on port 8000

**Error: `Authentication token required`**
- **Cause:** No JWT token provided
- **Solution:** Add token to Authorization header

**Error: `Invalid or expired token`**
- **Cause:** Token is invalid or expired
- **Solution:** Login again to get fresh token

**Error: `Too many connection attempts`**
- **Cause:** Rate limit exceeded (5 connections/minute)
- **Solution:** Wait 60 seconds before retrying

### Event Errors

**Error: `You are not a participant in this chat`**
- **Cause:** User is not part of this chat session
- **Solution:** Verify the chatSessionId and user association

**Error: `Chat session not found`**
- **Cause:** Chat session doesn't exist in database
- **Solution:** Create chat session or check ID

**Error: `Chat session has expired`**
- **Cause:** Chat's `expiresAt` time has passed
- **Solution:** Create new chat session

**Error: `Chat session has already ended`**
- **Cause:** Chat status is `ENDED`
- **Solution:** Create new chat session

**Error: `Rate limit exceeded. Slow down!`**
- **Cause:** Exceeded 60 events per minute
- **Solution:** Reduce message frequency

---

## Rate Limiting

The chat gateway implements two types of rate limiting:

### 1. Connection Rate Limit
- **Limit:** 5 connections per minute per user/IP
- **Window:** 60 seconds
- **Scope:** Per IP address (before auth) or per userId (after auth)

**Implementation:** `src/common/middleware/websocket-rate-limit.middleware.ts:29`

### 2. Event Rate Limit
- **Limit:** 60 events per minute per user
- **Window:** 60 seconds
- **Scope:** Per authenticated userId
- **Applies to:** Message sending, typing indicators, etc.

**Implementation:** `src/common/middleware/websocket-rate-limit.middleware.ts:77`

**Check:** Applied in gateway before processing events

```typescript
const allowed = await this.wsRateLimitMiddleware.checkEventRateLimit(userId);
if (!allowed) {
  client.emit(CHAT_EVENTS.ERROR, {
    message: 'Rate limit exceeded. Slow down!'
  });
  return;
}
```

---

## Redis Caching

The chat module uses Redis for performance optimization:

### Cached Data

**1. Chat Sessions**
- **Key:** `chat:session:{chatSessionId}`
- **TTL:** 2 hours
- **Data:** User IDs, venue ID, timestamps

**2. Messages**
- **Key:** `chat:messages:{chatSessionId}`
- **TTL:** 2 hours
- **Data:** Last 50 messages (Redis LIST)

**3. Socket Mappings**
- **Key:** `socket:user:{userId}`
- **TTL:** 1 hour
- **Data:** Socket ID for direct messaging

**4. User Active Chat**
- **Key:** `chat:user:{userId}`
- **TTL:** 2 hours
- **Data:** Current active chat session ID

### Cache Operations

**Message Caching** (`src/modules/redis/redis.service.ts:302`)
```typescript
await this.redis.cacheMessage(chatSessionId, {
  id: message.id,
  senderId: message.senderId,
  content: message.content,
  timestamp: message.createdAt.getTime(),
});
```

**Retrieving Cached Messages** (`src/modules/redis/redis.service.ts:326`)
```typescript
const messages = await this.redis.getCachedMessages(chatSessionId, 50);
```

---

## Auto-Reconnection

The chat gateway supports automatic reconnection:

### How It Works

1. User disconnects (network issue, browser closed, etc.)
2. User reconnects with valid JWT token
3. Gateway checks Redis for active chat session
4. If found, automatically rejoins the chat
5. Retrieves last 50 messages from cache
6. Emits `chat_joined` event with `reconnected: true`

**Implementation:** `src/modules/chat/chat.gateway.ts:287`

```typescript
private async handleAutoJoinChat(
  client: AuthenticatedSocket,
  userId: string,
): Promise<void> {
  const chatSessionId = await this.redis.getUserActiveChatSession(userId);

  if (chatSessionId) {
    client.join(`chat:${chatSessionId}`);
    const messages = await this.chatService.getMessages(chatSessionId, userId, { limit: 50 });
    const session = await this.chatService.getChatSession(chatSessionId, userId);

    client.emit(CHAT_EVENTS.CHAT_JOINED, {
      chatSessionId,
      messages,
      session,
      reconnected: true,
      timestamp: Date.now(),
    });
  }
}
```

---

## Background Jobs

The chat module runs periodic background jobs:

### 1. Expiry Warning Job

**Frequency:** Every 60 seconds
**Location:** `src/modules/chat/chat.gateway.ts:376`

**Purpose:** Warn users when their chat is about to expire

**Logic:**
- Finds chats expiring in next 5 minutes
- Emits `session_ending_soon` event to chat room
- Includes minutes remaining

```typescript
const expiringChats = await this.chatService.checkExpiringChats();

for (const chat of expiringChats) {
  this.server
    .to(`chat:${chat.chatSessionId}`)
    .emit(CHAT_EVENTS.SESSION_ENDING_SOON, {
      chatSessionId: chat.chatSessionId,
      minutesLeft: chat.minutesLeft,
      message: `Your chat will expire in ${chat.minutesLeft} minute(s)`,
      timestamp: Date.now(),
    });
}
```

### 2. Expired Chat Cleanup

**Frequency:** Every 60 seconds
**Location:** `src/modules/chat/chat.service.ts:376`

**Purpose:** Automatically end expired chats

**Logic:**
- Finds ACTIVE chats with `expiresAt < NOW()`
- Updates status to `EXPIRED`
- Cleans up Redis cache
- Removes user session mappings

```typescript
const expiredChats = await this.database.chatSession.findMany({
  where: {
    status: ChatSessionStatus.ACTIVE,
    expiresAt: { lt: now },
  },
});

for (const chat of expiredChats) {
  await this.database.chatSession.update({
    where: { id: chat.id },
    data: { status: ChatSessionStatus.EXPIRED },
  });

  await this.redis.deleteChatSession(chat.id, chat.user1Id, chat.user2Id);
}
```

---

## Event Constants

All events are defined in `src/modules/chat/constants/events.ts`:

```typescript
export const CHAT_EVENTS = {
  // Client → Server
  SEND_MESSAGE: 'send_message',
  TYPING: 'typing',
  END_CHAT: 'end_chat',
  JOIN_CHAT: 'join_chat',
  MARK_READ: 'mark_read',

  // Server → Client
  MESSAGE: 'message',
  PARTNER_TYPING: 'partner_typing',
  CHAT_ENDED: 'chat_ended',
  CHAT_JOINED: 'chat_joined',
  SESSION_ENDING_SOON: 'session_ending_soon',
  SESSION_EXPIRED: 'session_expired',
  PARTNER_LEFT: 'partner_left',
  MESSAGE_READ: 'message_read',
  ERROR: 'error',
} as const;
```

---

## Message Constants

All messages are defined in `src/modules/chat/constants/messages.ts`:

```typescript
export const CHAT_MESSAGES = {
  // Success messages
  MESSAGE_SENT: 'Message sent successfully',
  CHAT_ENDED: 'Chat session ended successfully',

  // Error messages
  CHAT_NOT_FOUND: 'Chat session not found',
  NOT_PARTICIPANT: 'You are not a participant in this chat',
  CHAT_EXPIRED: 'Chat session has expired',
  CHAT_ALREADY_ENDED: 'Chat session has already ended',
  MESSAGE_TOO_LONG: 'Message exceeds maximum length',
  PARTNER_LEFT: 'Your chat partner has left',
} as const;
```

---

## Troubleshooting

### Problem: Cannot connect to WebSocket

**Check:**
1. Server is running: `npm run start:dev`
2. Redis is running: `redis-cli ping` (should return PONG)
3. Port is correct (8000)
4. ChatModule imported in AppModule
5. JWT token is valid

### Problem: Connected but no response to events

**Check:**
1. JWT token in Authorization header
2. Chat session exists in database with status `ACTIVE`
3. User is participant in the chat (user1Id or user2Id)
4. Server logs for errors

### Problem: Rate limit errors

**Solution:**
- Wait 60 seconds
- Reduce message frequency
- Check if multiple clients using same token

### Problem: Messages not received by partner

**Check:**
1. Both users connected to same `chatSessionId`
2. Both users joined the chat room with `join_chat` event
3. Chat status is `ACTIVE`
4. Check server logs for delivery errors

---

## Production Considerations

### Security

1. **Use HTTPS/WSS** in production
   ```typescript
   @WebSocketGateway({
     namespace: 'chat',
     cors: {
       origin: process.env.CLIENT_URL,
       credentials: true,
     },
   })
   ```

2. **Secure Redis** with password
   ```env
   REDIS_PASSWORD=your-secure-password
   ```

3. **Rate limiting** - Adjust based on usage patterns

4. **Input validation** - Already implemented with class-validator

### Scalability

1. **Redis Adapter** for horizontal scaling
   ```typescript
   import { RedisIoAdapter } from '@/adapters/redis-io.adapter';
   app.useWebSocketAdapter(new RedisIoAdapter(app));
   ```

2. **Load balancing** with sticky sessions

3. **Message queue** for offline message delivery

### Monitoring

1. **Log all connections/disconnections**
2. **Track message delivery rates**
3. **Monitor Redis memory usage**
4. **Set up alerts for errors**

---

## API Reference

### ChatService Methods

**`getChatSession(chatSessionId, userId)`**
- Get chat session details with participants
- Validates user is participant
- Returns session with user and venue details

**`validateParticipant(chatSessionId, userId)`**
- Checks if user is part of chat
- Throws ForbiddenException if not

**`sendMessage(data)`**
- Creates message in database
- Caches in Redis
- Returns created message

**`getMessages(chatSessionId, userId, options)`**
- Retrieves message history
- Supports pagination
- Returns from cache first, then database

**`endChat(chatSessionId, userId)`**
- Ends chat session
- Updates status to ENDED
- Cleans up Redis cache

---

## Contributing

When adding new features to the chat module:

1. Add new events to `constants/events.ts`
2. Add new messages to `constants/messages.ts`
3. Create DTOs in `dto/request/` or `dto/response/`
4. Implement handler in `ChatGateway`
5. Add business logic in `ChatService`
6. Update this documentation
7. Add tests

---

## License

MIT

---

**Last Updated:** November 7, 2025
**Version:** 1.0.0

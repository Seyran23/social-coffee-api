# Architecture Diagrams

## 1. System Architecture

```mermaid
graph TD
    MobileApp["📱 Mobile App"]

    subgraph Fly.io
        API["🚀 NestJS API\nsocial-coffee-api.fly.dev"]
    end

    subgraph External Services
        Neon["🐘 Neon\nPostgreSQL"]
        Upstash["⚡ Upstash\nRedis"]
        Cloudinary["🖼️ Cloudinary\nImage Storage"]
    end

    MobileApp -- "REST (HTTPS)" --> API
    MobileApp -- "WebSocket /presence (WSS)" --> API
    MobileApp -- "WebSocket /chat (WSS)" --> API

    API -- "Prisma ORM" --> Neon
    API -- "ioredis" --> Upstash
    API -- "SDK" --> Cloudinary
```

---

## 2. Database Schema (ERD)

```mermaid
erDiagram
    User {
        uuid id PK
        string firstName
        string lastName
        date birthDate
        string email UK
        string passwordHash
        enum gender
        enum role
        string profileImageUrl
        string bio
        datetime deletedAt
    }

    Preference {
        cuid id PK
        uuid userId FK UK
        int minAge
        int maxAge
        enum preferredGender
        enum[] lookingFor
    }

    Interest {
        cuid id PK
        string name UK
    }

    UserInterest {
        uuid userId FK
        cuid interestId FK
    }

    Venue {
        cuid id PK
        string name
        string mapUrl
        float latitude
        float longitude
        int geofenceMeters
        enum status
    }

    Interaction {
        cuid id PK
        string venueId FK
        uuid actorUserId FK
        uuid targetUserId FK
        enum type
    }

    ChatSession {
        cuid id PK
        string venueId FK
        uuid user1Id FK
        uuid user2Id FK
        enum status
        datetime startedAt
        datetime expiresAt
    }

    Message {
        cuid id PK
        string chatSessionId FK
        uuid senderId FK
        string content
        datetime createdAt
    }

    Token {
        cuid id PK
        uuid userId FK
        string token UK
        enum type
        datetime expiresAt
    }

    User ||--o| Preference : "has"
    User ||--o{ UserInterest : "picks"
    Interest ||--o{ UserInterest : "picked by"
    User ||--o{ Interaction : "acts"
    User ||--o{ Interaction : "receives"
    Venue ||--o{ Interaction : "scoped to"
    Venue ||--o{ ChatSession : "hosts"
    User ||--o{ ChatSession : "user1"
    User ||--o{ ChatSession : "user2"
    ChatSession ||--o{ Message : "contains"
    User ||--o{ Message : "sends"
    User ||--o{ Token : "owns"
```

---

## 3. User Journey Flow

```mermaid
flowchart TD
    A([User arrives at Venue]) --> B[Venue provides QR code\nspecially issued for Social Coffee]
    B --> C[User scans QR code\nwith Social Coffee app]
    C --> D[App validates geolocation\nUser must be within geofence radius]
    D --> E{Inside geofence?}
    E -- No --> F[Check-in rejected]
    F --> C
    E -- Yes --> G[Check-in confirmed\nPOST /venues/:id/checkin]
    G --> H[Connect to /presence WebSocket]
    H --> I[Receive Discovery Feed]
    I --> J{Like someone?}
    J -- No --> I
    J -- Yes --> K[POST /interactions/like]
    K --> L{Mutual Like?}
    L -- No, wait --> I
    L -- Yes! --> M[🎉 Match! ChatSession created]
    M --> N[Connect to /chat WebSocket]
    N --> O[10-minute Chat Session]
    O --> P{Time up or ended?}
    P -- Ended --> I
    P -- Still chatting --> O

```

---

## 4. Authentication Flow

```mermaid
sequenceDiagram
    participant App as 📱 Mobile App
    participant API as 🚀 API Server
    participant DB as 🐘 Database

    App->>API: POST /auth/login
    API->>DB: Find user by email
    DB-->>API: User record
    API->>API: bcrypt.compare(password, hash)
    API-->>App: { accessToken, refreshToken (httpOnly cookie) }

    Note over App,API: accessToken expires in 15 minutes

    App->>API: GET /profile/me\nAuthorization: Bearer <accessToken>
    API->>API: Verify JWT signature
    API-->>App: Profile data

    Note over App,API: Token expired...

    App->>API: POST /auth/refresh-token\n(cookie sent automatically)
    API->>DB: Find & validate refresh token
    API->>DB: Delete old refresh token
    API->>DB: Save new refresh token
    API-->>App: { new accessToken, new refreshToken cookie }
```

---

## 5. Real-time Chat Flow

```mermaid
sequenceDiagram
    participant U1 as 📱 User 1
    participant API as 🚀 API /chat
    participant Redis as ⚡ Redis
    participant DB as 🐘 Database
    participant U2 as 📱 User 2

    U1->>API: connect (JWT token)
    API->>Redis: getUserActiveChatSession(user1)
    Redis-->>API: chatSessionId
    API-->>U1: chat_joined { messages, session }

    U2->>API: connect (JWT token)
    API-->>U2: chat_joined { messages, session }

    U1->>API: send_message { content }
    API->>DB: INSERT message
    API->>Redis: cacheMessage()
    API-->>U1: message { id, content, senderId }
    API-->>U2: message { id, content, senderId }

    U1->>API: typing { isTyping: true }
    API-->>U2: partner_typing { isTyping: true }

    Note over API: 10 minutes elapsed

    API-->>U1: session_ending_soon { minutesLeft: 1 }
    API-->>U2: session_ending_soon { minutesLeft: 1 }
    API->>DB: UPDATE status = EXPIRED
    API-->>U1: chat_ended
    API-->>U2: chat_ended
```

---

## 6. Presence & Venue Flow

```mermaid
sequenceDiagram
    participant App as 📱 Mobile App
    participant REST as 🚀 REST API
    participant WS as 🚀 /presence WS
    participant Redis as ⚡ Redis
    participant Venue as 👥 Venue Room

    App->>REST: POST /venues/:id/checkin\n{ latitude, longitude }
    REST->>REST: Validate geofence
    REST->>Redis: addUserToVenue(userId, venueId)
    REST-->>App: 200 OK

    App->>WS: connect (JWT token)
    WS->>Redis: getUserCurrentVenue(userId)
    Redis-->>WS: venueId
    WS->>WS: socket.join("venue:venueId")
    WS-->>App: feed_initial { users[] }
    WS-->>Venue: user_joined { user }

    loop Every 30 seconds
        App->>WS: heartbeat { lat?, lon? }
        WS->>Redis: updateHeartbeat(userId)
        WS-->>App: heartbeat_ack
    end

    App->>WS: disconnect
    Note over WS: 30-second grace period starts

    alt User reconnects within 30s
        App->>WS: connect
        Note over WS: Grace period cancelled silently
    else Grace period expires
        WS-->>Venue: user_left { userId }
        WS->>Redis: removeUserFromVenue()
    end
```

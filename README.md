# ☕ Social Coffee

In an age of endless swipes, infinite likes, and digital noise, we've started to forget what real connection feels like.  
**Social Coffee** is our way of changing that — a space where technology helps people meet, not replace, each other.

We’re not building another social media platform.  
We’re creating a bridge between _online discovery_ and _offline authenticity_ — where every connection has a story, and every meeting has meaning.

---

## 🌍 What We Believe

- Real interaction > endless scrolling
- Shared stories > shared posts
- Tech should bring people closer, not further apart

Our goal is to **use the best parts of the digital era** — convenience, reach, discovery —  
while **keeping the essence of human connection alive** through real-world encounters.

---

## 🚀 Getting Started

If you’d like to explore or contribute to Social Coffee, see the full setup guide:

👉 [Project Setup & Development Guide](./docs/SETUP.md)

---

## 📚 Documentation

| Doc                                                            | Description                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------- |
| [Setup Guide](./docs/SETUP.md)                                 | Install, configure, and run the project                             |
| [Integration Guide](./docs/INTEGRATION_GUIDE.md)               | Full end-to-end user journey (REST + WebSocket)                     |
| [Presence WebSocket Guide](./docs/PRESENCE_WEBSOCKET_GUIDE.md) | `/presence` namespace — venue feed, join/leave events, heartbeat    |
| [Chat WebSocket Guide](./docs/CHAT_WEBSOCKET_GUIDE.md)         | `/chat` namespace — messaging, typing indicators, session lifecycle |
| [API Reference (Swagger)](http://localhost:8000/docs)          | Interactive REST API docs (server must be running)                  |

---

## 🧩 Tech Stack

- **Backend:** NestJS, Prisma, PostgreSQL, Redis
- **Real-time:** Socket.io (presence + chat WebSocket gateways)
- **Auth:** JWT (access + refresh tokens), httpOnly cookies
- **Documentation:** Swagger (REST), Markdown (WebSocket)
- **Infra:** Helmet, Throttler, @nestjs/terminus health checks

---

## 🫱 Meet Us Over Coffee

This project started with a simple idea:

> “What if meeting new people felt as natural as chatting over coffee?”

We’re still brewing. ☕ Stay tuned.

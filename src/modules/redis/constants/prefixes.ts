export const REDIS_KEY_PREFIX = {
  HEARTBEAT: 'heartbeat',

  CHAT_SESSION: 'chat:session',
  CHAT_USER: 'chat:user',
  CHAT_MESSAGES: 'chat:messages',

  SOCKET_USER: 'socket:user',
  SOCKET_ID: 'socket',

  VENUE_USERS: 'venue',
  USER_VENUE: 'user',

  USER_MATCHES_UNREAD: 'user',

  PROFILE: 'profile',

  QR: 'qr',

  TYPING: 'typing',

  STATS: 'stats',

  RATE_LIMIT: 'ratelimit',

  CACHE: 'cache',
} as const;

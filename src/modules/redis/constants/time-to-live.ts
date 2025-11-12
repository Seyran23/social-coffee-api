export const REDIS_TTL = {
  HEARTBEAT: 120, // 2 minutes
  HEARTBEAT_ACTIVE_THRESHOLD: 90000, // 90 seconds (in milliseconds)

  CHAT_SESSION: 7200, // 2 hours
  CHAT_MESSAGES_CACHE: 7200, // 2 hours

  SOCKET_MAPPING: 86400, // 24 hours

  VENUE_PRESENCE: 3600, // 1 hour

  PROFILE_CACHE: 300, // 5 minutes

  TYPING_INDICATOR: 5, // 5 seconds

  STATS_RETENTION: 86400 * 30, // 30 days

  DEFAULT_CACHE: 3600, // 1 hour
} as const;

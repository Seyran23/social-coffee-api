export interface RateLimitConfig {
  maxConnections?: number; // Max connections per window
  windowMs?: number; // Time window in milliseconds
  maxEventsPerMinute?: number; // Max events per user per minute
}

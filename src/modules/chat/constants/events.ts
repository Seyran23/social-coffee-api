export const CHAT_EVENTS = {
  // Client → Server
  SEND_MESSAGE: 'send_message',
  TYPING: 'typing',
  END_CHAT: 'end_chat',
  JOIN_CHAT: 'join_chat',

  // Server → Client
  MATCH_FOUND: 'match_found',
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

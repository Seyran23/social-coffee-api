export const CHAT_MESSAGES = {
  // Success messages
  MESSAGE_SENT: 'Message sent successfully',
  CHAT_ENDED: 'Chat session ended successfully',
  MESSAGES_RETRIEVED: 'Messages retrieved successfully',
  SESSION_RETRIEVED: 'Chat session retrieved successfully',

  // Error messages
  CHAT_NOT_FOUND: 'Chat session not found',
  NOT_PARTICIPANT: 'You are not a participant in this chat',
  CHAT_EXPIRED: 'Chat session has expired',
  CHAT_ALREADY_ENDED: 'Chat session has already ended',
  MESSAGE_TOO_LONG: 'Message exceeds maximum length',
  PARTNER_LEFT: 'Your chat partner has left',
} as const;

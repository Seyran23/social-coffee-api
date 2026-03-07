export const INTERACTION_MESSAGES = {
    LIKE_SUCCESS: 'User liked successfully',
    UNLIKE_SUCCESS: 'User unliked successfully',
    MATCH_FOUND: 'It\'s a match! Chat session created',
    SELF_LIKE: 'You cannot like yourself',
    NOT_AT_VENUE: 'Both users must be checked into the venue',
    ALREADY_LIKED: 'You have already liked this user at this venue',
    INTERACTION_NOT_FOUND: 'Interaction not found',
    MY_LIKES_RETRIEVED: 'Your likes retrieved successfully',
    LIKED_ME_RETRIEVED: 'Users who liked you retrieved successfully',
    ALREADY_IN_CHAT: 'You already have an active chat session',
} as const;

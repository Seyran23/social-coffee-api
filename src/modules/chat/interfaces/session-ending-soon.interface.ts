export interface SessionEndingSoonPayload {
  chatSessionId: string;
  minutesLeft: number;
  message: string;
  timestamp: number;
}

export interface ChatEnded {
  chatSessionId: string;
  endedBy: string;
  message: string;
  timestamp: number;
}

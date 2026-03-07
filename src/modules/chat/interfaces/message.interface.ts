export interface Message {
  id: string;
  chatSessionId: string;
  senderId: string;
  content: string;
  createdAt: Date;
}

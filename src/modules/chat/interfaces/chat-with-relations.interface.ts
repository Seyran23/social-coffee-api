import { ChatSessionStatus } from "@prisma/client";

export interface ChatSessionWithRelations {
  id: string;
  venueId: string;
  user1Id: string | null;
  user2Id: string | null;
  status: ChatSessionStatus;
  startedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user1: {
    id: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  user2: {
    id: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  venue: {
    id: string;
    name: string;
  };
}

import { Socket } from 'socket.io';

import { RequestUser } from '@/common/interfaces/auth/request-user.interface';

export interface AuthenticatedSocket extends Socket {
  user: RequestUser;
  venue: {
    id: string;
  };
}

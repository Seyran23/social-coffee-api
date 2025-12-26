import { WebSocketGateway } from '@nestjs/websockets';

import { PresenceService } from './presence.service';

@WebSocketGateway()
export class PresenceGateway {
  constructor(private readonly presenceService: PresenceService) {}
}

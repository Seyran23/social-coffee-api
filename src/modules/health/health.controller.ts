import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  constructor() {}

  @Get()
  root() {
    return {
      ok: true,
      data: {
        status: 'ok',
        uptime: process.uptime(),
        version: process.env.npm_package_version ?? 'dev',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

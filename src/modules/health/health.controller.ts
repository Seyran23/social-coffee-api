import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';

import { ApiSuccessResponse } from '@/common/decorators/swagger.decorator';
import { ResponseBuilder } from '@/common/utils/response-builder';
import { HealthDto } from '@/modules/health/dto/health.dto';
import { PrismaHealthIndicator } from '@/modules/health/indicators/prisma.health';
import { RedisHealthIndicator } from '@/modules/health/indicators/redis.health';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Liveness probe (default)',
    description:
      'Returns the health status of the application. Cheap check — does not query downstream dependencies.',
  })
  @ApiSuccessResponse(HealthDto, {
    description: 'Health check successful',
    status: 200,
  })
  root() {
    return ResponseBuilder.success(
      {
        uptime: process.uptime(),
        version: process.env.npm_package_version ?? 'dev',
      },
      'Health check successful',
    );
  }

  @Get('live')
  @ApiOperation({
    summary: 'Liveness probe',
    description:
      'Lightweight check that the process is running. Use as a Kubernetes livenessProbe.',
  })
  live() {
    return ResponseBuilder.success(
      {
        uptime: process.uptime(),
        version: process.env.npm_package_version ?? 'dev',
      },
      'alive',
    );
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({
    summary: 'Readiness probe',
    description:
      'Checks downstream dependencies (Postgres, Redis). Returns 503 if any are unreachable. Use as a Kubernetes readinessProbe.',
  })
  ready() {
    return this.health.check([
      () => this.prisma.pingCheck('database'),
      () => this.redis.pingCheck('redis'),
    ]);
  }
}

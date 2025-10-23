import { Controller, Get } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';

import { ApiSuccessResponse } from '@/common/decorators/swagger.decorator';
import { ResponseBuilder } from '@/common/utils/response-builder';
import { HealthDto } from '@/modules/health/dto/health.dto';

@Controller('health')
export class HealthController {
  constructor() {}

  @Get()
  @ApiOperation({
    summary: 'Health check endpoint',
    description: 'Returns the health status of the application',
  })
  @ApiSuccessResponse(HealthDto, {
    description: 'Health check successful response',
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
}

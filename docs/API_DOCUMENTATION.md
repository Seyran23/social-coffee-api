# API Documentation Guide

This guide explains how to document your API endpoints using our custom Swagger decorators and follow best practices for controllers and services.

---

## Table of Contents

1. [Custom Swagger Decorators](#custom-swagger-decorators)
2. [Controller Best Practices](#controller-best-practices)
3. [Service Best Practices](#service-best-practices)
4. [Complete Examples](#complete-examples)

---

## Custom Swagger Decorators

We use custom Swagger decorators located in `src/common/decorators/swagger.decorator.ts` to maintain consistency across the API documentation.

### Available Decorators

#### 1. `@ApiSuccessResponse`

Documents successful responses with the standardized response wrapper.

**Signature:**

```typescript
ApiSuccessResponse<TModel>(
  model: TModel,
  options?: {
    description?: string;
    isArray?: boolean;
    status?: number;
  }
)
```

**Usage:**

```typescript
@ApiSuccessResponse(UserDto, {
  description: 'User retrieved successfully',
  status: 200
})

// For array responses
@ApiSuccessResponse(VenueResponseDto, {
  description: 'Venues retrieved successfully',
  isArray: true
})
```

**Generated Response Structure:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "User retrieved successfully",
  "data": { /* UserDto */ },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### 2. `@ApiErrorResponse`

Documents error responses with specific status codes.

**Signature:**

```typescript
ApiErrorResponse(
  status: number,
  description: string,
  includeValidationErrors?: boolean
)
```

**Usage:**

```typescript
@ApiErrorResponse(404, 'User not found')
@ApiErrorResponse(400, 'Invalid input', true) // with validation errors
```

**Generated Response Structure:**

```json
{
  "success": false,
  "statusCode": 404,
  "message": "User not found",
  "data": null,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### 3. `@ApiValidationErrorResponse`

Documents validation error responses (400 status).

**Usage:**

```typescript
@ApiValidationErrorResponse()
```

**Generated Response Structure:**

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "data": null,
  "errors": [
    {
      "field": "email",
      "messages": ["Email is invalid", "Email is required"]
    }
  ],
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### 4. `@ApiCommonErrorResponses`

Combines commonly used error responses (401, 403, 404, 500).

**Usage:**

```typescript
@ApiCommonErrorResponses()
```

Equivalent to:

```typescript
@ApiErrorResponse(401, 'Unauthorized - Authentication required')
@ApiErrorResponse(403, 'Forbidden - Insufficient permissions')
@ApiErrorResponse(404, 'Not Found - Resource does not exist')
@ApiErrorResponse(500, 'Internal Server Error')
```

#### 5. `@ApiAllErrorResponses`

Combines validation errors and common error responses.

**Usage:**

```typescript
@ApiAllErrorResponses()
```

Equivalent to:

```typescript
@ApiValidationErrorResponse()
@ApiCommonErrorResponses()
```

---

## Controller Best Practices

Controllers should handle HTTP concerns and delegate business logic to services.

### Rules

1. **Use `@ApiOperation` for every endpoint** with both `summary` and `description`
2. **Always use `ResponseBuilder`** to return consistent responses
3. **Add appropriate Swagger decorators** for all response types
4. **Keep controllers thin** - only handle HTTP layer concerns
5. **Use proper HTTP status codes** with `@HttpCode()` when needed
6. **Add `@ApiBearerAuth('jwt')` for protected endpoints**
7. **Use `@ApiTags()` to group related endpoints**

### Example Controller Structure

```typescript
import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  ApiSuccessResponse,
  ApiErrorResponse,
  ApiAllErrorResponses,
} from '@/common/decorators/swagger.decorator';
import { ResponseBuilder } from '@/common/utils/response-builder';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

@ApiTags('Users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @ApiOperation({
    summary: 'Get all users',
    description: 'Retrieve a paginated list of users with optional filtering',
  })
  @ApiSuccessResponse(UserDto, {
    description: 'Users retrieved successfully',
    isArray: true,
  })
  @ApiErrorResponse(500, 'Internal Server Error')
  async getUsers(@Query() query: GetUsersQueryDto) {
    const result = await this.userService.getUsers(query);
    return ResponseBuilder.paginated(
      result.users,
      result.total,
      result.page,
      result.limit,
      'Users retrieved successfully',
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get user by ID',
    description: 'Retrieve detailed information about a specific user',
  })
  @ApiSuccessResponse(UserDto, {
    description: 'User retrieved successfully',
  })
  @ApiErrorResponse(404, 'User not found')
  @ApiErrorResponse(500, 'Internal Server Error')
  async getUser(@Param('id') id: string) {
    const user = await this.userService.getUser(id);
    return ResponseBuilder.success(user, 'User retrieved successfully');
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new user',
    description: 'Create a new user with the provided information',
  })
  @ApiSuccessResponse(UserDto, {
    description: 'User created successfully',
    status: 201,
  })
  @ApiAllErrorResponses()
  async createUser(@Body() createUserDto: CreateUserDto) {
    const user = await this.userService.createUser(createUserDto);
    return ResponseBuilder.success(
      user,
      'User created successfully',
      HttpStatus.CREATED,
    );
  }
}
```

### ResponseBuilder Methods

```typescript
// Success response
ResponseBuilder.success(data, message?, statusCode?)

// Paginated response
ResponseBuilder.paginated(data, total, page, limit, message?)

// Error response
ResponseBuilder.error(message, statusCode?, errors?)

// Validation error response
ResponseBuilder.validationError(errors, message?, statusCode?)
```

---

## Service Best Practices

Services contain business logic and should always have explicit return types.

### Rules

1. **Always specify return types** - Never use implicit returns
2. **Use typed DTOs for return values** - Not raw Prisma models
3. **Throw appropriate NestJS exceptions** - `NotFoundException`, `BadRequestException`, etc.
4. **Keep methods focused** - Single responsibility principle
5. **Use dependency injection** properly

### Example Service Structure

```typescript
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UserDto } from './dto/user.dto';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  // ✅ CORRECT: Explicit return type
  async getUser(id: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  // ✅ CORRECT: Explicit return type with complex structure
  async getUsers(params: GetUsersQueryDto): Promise<{
    users: UserDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page = 1, limit = 10 } = params;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count(),
    ]);

    return {
      users,
      total,
      page,
      limit,
    };
  }

  // ✅ CORRECT: Void return type for operations with no return value
  async deleteUser(id: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.delete({
      where: { id },
    });
  }

  // ❌ WRONG: No return type specified
  async createUser(dto: CreateUserDto) {
    return this.prisma.user.create({ data: dto });
  }

  // ❌ WRONG: Using 'any' type
  async updateUser(id: string, dto: UpdateUserDto): Promise<any> {
    // ...
  }
}
```

### Common NestJS Exceptions

```typescript
import {
  BadRequestException,     // 400
  UnauthorizedException,   // 401
  ForbiddenException,      // 403
  NotFoundException,       // 404
  ConflictException,       // 409
  InternalServerErrorException, // 500
} from '@nestjs/common';

// Usage examples
throw new NotFoundException('User not found');
throw new BadRequestException('Invalid email format');
throw new ConflictException('Email already exists');
throw new UnauthorizedException('Invalid credentials');
throw new ForbiddenException('Insufficient permissions');
```

---

## Complete Examples

### Example 1: Simple CRUD Endpoint

**Controller:**

```typescript
@Get(':id')
@ApiOperation({
  summary: 'Get venue by ID',
  description: 'Retrieve detailed information about a specific venue including its QR code',
})
@ApiSuccessResponse(VenueWithQrCodeDto, {
  description: 'Venue retrieved successfully',
})
@ApiErrorResponse(404, 'Venue not found')
@ApiErrorResponse(500, 'Internal Server Error')
async getVenue(@Param('id') id: string) {
  const venue = await this.venueService.getVenue(id);
  return ResponseBuilder.success(venue, 'Venue retrieved successfully');
}
```

**Service:**

```typescript
async getVenue(id: string): Promise<VenueWithQrCodeDto> {
  const venue = await this.prisma.venue.findUnique({
    where: { id },
  });

  if (!venue) {
    throw new NotFoundException('Venue not found');
  }

  const qrCode = await generateQRCodeDataURL(venue.id);

  return {
    ...venue,
    qrCode,
  };
}
```

### Example 2: Protected Endpoint with Complex Logic

**Controller:**

```typescript
@Post()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth('jwt')
@HttpCode(HttpStatus.CREATED)
@ApiOperation({
  summary: 'Create a new venue',
  description: 'Create a new venue with location details. Coordinates will be automatically extracted from the provided map URL. Requires admin role.',
})
@ApiSuccessResponse(VenueWithQrCodeDto, {
  description: 'Venue created successfully',
  status: 201,
})
@ApiAllErrorResponses()
async createVenue(@Body() createVenueDto: CreateVenueDto) {
  const venue = await this.venueService.createVenue(createVenueDto);
  return ResponseBuilder.success(
    venue,
    'Venue created successfully',
    HttpStatus.CREATED,
  );
}
```

**Service:**

```typescript
async createVenue(createVenueDto: CreateVenueDto): Promise<VenueWithQrCodeDto> {
  const coordinates = await extractLatLonFromGoogleMaps(
    createVenueDto.mapUrl,
  );

  if (!coordinates) {
    throw new BadRequestException('Invalid map URL');
  }

  const { latitude, longitude } = coordinates;

  const venue = await this.prisma.venue.create({
    data: {
      ...createVenueDto,
      latitude,
      longitude,
    },
  });

  const qrCode = await generateQRCodeDataURL(venue.id);

  return {
    ...venue,
    qrCode,
  };
}
```

### Example 3: Paginated Endpoint

**Controller:**

```typescript
@Get()
@ApiOperation({
  summary: 'Get all venues',
  description: 'Retrieve a paginated list of venues with optional filtering by name, status, and sorting options',
})
@ApiSuccessResponse(VenueResponseDto, {
  description: 'Venues retrieved successfully',
  isArray: true,
})
@ApiErrorResponse(500, 'Internal Server Error')
async getVenues(@Query() query: GetVenuesQueryDto) {
  const { venues, total, page, limit } = await this.venueService.getVenues(query);

  return ResponseBuilder.paginated(
    venues,
    total,
    page,
    limit,
    'Venues retrieved successfully',
  );
}
```

**Service:**

```typescript
async getVenues(params: GetVenuesQueryDto): Promise<{
  venues: VenueResponseDto[];
  total: number;
  page: number;
  limit: number;
}> {
  const {
    page = 1,
    limit = 10,
    search,
    status,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = params;

  const validPage = Math.max(1, page);
  const validLimit = Math.min(Math.max(1, limit), 100);
  const skip = (validPage - 1) * validLimit;

  const where: Prisma.VenueWhereInput = {};

  if (search) {
    where.name = {
      contains: search,
      mode: 'insensitive',
    };
  }

  if (status) {
    where.status = status;
  }

  const orderBy: Prisma.VenueOrderByWithRelationInput = {
    [sortBy]: sortOrder,
  };

  const [venues, total] = await Promise.all([
    this.prisma.venue.findMany({
      where,
      skip,
      take: validLimit,
      orderBy,
    }),
    this.prisma.venue.count({ where }),
  ]);

  return {
    venues,
    total,
    page: validPage,
    limit: validLimit,
  };
}
```

---

## Quick Checklist

### For Every Controller Endpoint:

- [ ] `@ApiOperation` with `summary` and `description`
- [ ] `@ApiSuccessResponse` with appropriate DTO
- [ ] Error responses (`@ApiErrorResponse`, `@ApiCommonErrorResponses`, etc.)
- [ ] `@ApiBearerAuth('jwt')` for protected endpoints
- [ ] `ResponseBuilder` for return values
- [ ] Proper HTTP status codes

### For Every Service Method:

- [ ] Explicit return type (`:Promise<Type>`)
- [ ] Return typed DTOs, not raw Prisma models
- [ ] Throw appropriate NestJS exceptions
- [ ] Validate input data
- [ ] Handle edge cases

---

## Additional Resources

- [NestJS Swagger Documentation](https://docs.nestjs.com/openapi/introduction)
- [Custom Decorators Source](../src/common/decorators/swagger.decorator.ts)
- [Response Builder Source](../src/common/utils/response-builder.ts)
- [Code Style Guide](./CODE_STYLE.md)

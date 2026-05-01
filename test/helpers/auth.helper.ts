import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { expect } from 'vitest';

const TEST_USER_BASE = {
  firstName: 'Test',
  lastName: 'User',
  password: 'Password123!',
  birthDate: '1995-06-15',
  gender: 'MALE',
  bio: 'E2E test user account.',
};

let userCounter = 0;

/**
 * Registers a unique test user and returns their tokens + email.
 * Each call gets a distinct email to avoid conflicts across tests.
 */
export async function registerTestUser(
  app: INestApplication,
  overrides: Partial<typeof TEST_USER_BASE & { email: string }> = {},
) {
  userCounter++;
  const email =
    overrides.email ?? `testuser_${userCounter}_${Date.now()}@test.com`;

  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({ ...TEST_USER_BASE, ...overrides, email });

  if (res.status !== 201) {
    console.error('FAILED TO REGISTER USER:', res.body);
  }
  expect(res.status).toBe(201);

  return {
    email,
    accessToken: res.body.data.accessToken as string,
    user: res.body.data.user,
    // Grab the refresh token from Set-Cookie header
    refreshToken: extractRefreshToken(res.headers['set-cookie']),
  };
}

/**
 * Logs in with an existing user's credentials. Returns access token.
 */
export async function loginTestUser(
  app: INestApplication,
  email: string,
  password: string = TEST_USER_BASE.password,
) {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);

  return {
    accessToken: res.body.data.accessToken as string,
    refreshToken: extractRefreshToken(res.headers['set-cookie']),
  };
}

/**
 * Extracts the raw refreshToken value from the Set-Cookie header array.
 */
export function extractRefreshToken(
  cookies: string | string[] | undefined,
): string {
  if (!cookies) {
    return '';
  }
  const cookieArr = Array.isArray(cookies) ? cookies : [cookies];
  const match = cookieArr.join(';').match(/refreshToken=([^;]+)/);
  return match ? match[1] : '';
}

/**
 * Builds a Bearer auth header object for use with supertest.
 */
export function bearerAuth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

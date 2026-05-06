import { describe, expect, it } from 'vitest';

import { ResponseBuilder } from '@/common/utils/response-builder';

describe('ResponseBuilder', () => {
  describe('success', () => {
    it('should return a success response with data and default status 200', () => {
      const result = ResponseBuilder.success({ id: '1' }, 'OK');

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.message).toBe('OK');
      expect(result.data).toEqual({ id: '1' });
      expect(result.timestamp).toBeDefined();
    });

    it('should accept a custom statusCode', () => {
      const result = ResponseBuilder.success(null, 'Created', 201);

      expect(result.statusCode).toBe(201);
      expect(result.data).toBeNull();
    });

    it('should accept an array as data', () => {
      const result = ResponseBuilder.success([1, 2, 3]);

      expect(result.data).toEqual([1, 2, 3]);
    });
  });

  describe('error', () => {
    it('should return a failure response with default status 400', () => {
      const result = ResponseBuilder.error('Something went wrong');

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(400);
      expect(result.message).toBe('Something went wrong');
      expect(result.data).toBeNull();
      expect(result.timestamp).toBeDefined();
    });

    it('should include errors array when provided', () => {
      const errors = [{ field: 'email', message: 'Invalid email' }];
      const result = ResponseBuilder.error('Validation failed', 422, errors);

      expect(result.statusCode).toBe(422);
      expect(result.errors).toEqual(errors);
    });

    it('should return undefined errors when not provided', () => {
      const result = ResponseBuilder.error('Not found', 404);

      expect(result.errors).toBeUndefined();
    });
  });

  describe('validationError', () => {
    it('should return a validation error response with default message and 400', () => {
      const errors = [{ field: 'name', message: 'Required' }];
      const result = ResponseBuilder.validationError(errors);

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(400);
      expect(result.message).toBe('Validation failed');
      expect(result.errors).toEqual(errors);
      expect(result.data).toBeNull();
    });

    it('should accept a custom message and statusCode', () => {
      const errors = [{ field: 'age', message: 'Must be >= 18' }];
      const result = ResponseBuilder.validationError(
        errors,
        'Custom validation message',
        422,
      );

      expect(result.message).toBe('Custom validation message');
      expect(result.statusCode).toBe(422);
    });
  });

  describe('paginated', () => {
    it('should compute pagination metadata correctly', () => {
      const result = ResponseBuilder.paginated(['a', 'b', 'c'], 30, 2, 10);

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.data).toEqual(['a', 'b', 'c']);
      expect(result.pagination.total).toBe(30);
      expect(result.pagination.page).toBe(2);
      expect(result.pagination.limit).toBe(10);
      expect(result.pagination.totalPages).toBe(3);
      expect(result.pagination.hasNextPage).toBe(true);
      expect(result.pagination.hasPreviousPage).toBe(true);
    });

    it('should set hasNextPage=false on the last page', () => {
      const result = ResponseBuilder.paginated([], 20, 2, 10);

      expect(result.pagination.hasNextPage).toBe(false);
      expect(result.pagination.hasPreviousPage).toBe(true);
    });

    it('should set hasPreviousPage=false on the first page', () => {
      const result = ResponseBuilder.paginated([], 50, 1, 10);

      expect(result.pagination.hasPreviousPage).toBe(false);
      expect(result.pagination.hasNextPage).toBe(true);
    });
  });
});

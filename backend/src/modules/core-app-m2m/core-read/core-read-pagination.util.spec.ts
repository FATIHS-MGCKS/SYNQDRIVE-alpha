import { BadRequestException } from '@nestjs/common';
import { parseCoreReadPagination } from './core-read-pagination.util';

describe('parseCoreReadPagination', () => {
  it('defaults missing query params', () => {
    expect(parseCoreReadPagination(undefined, undefined)).toEqual({
      page: 1,
      pageSize: 25,
      skip: 0,
    });
  });

  it('caps pageSize at 100', () => {
    expect(parseCoreReadPagination('1', '100')).toEqual({
      page: 1,
      pageSize: 100,
      skip: 0,
    });
    expect(() => parseCoreReadPagination('1', '101')).toThrow(BadRequestException);
  });

  it('rejects malformed and negative values', () => {
    expect(() => parseCoreReadPagination('-1', undefined)).toThrow(BadRequestException);
    expect(() => parseCoreReadPagination('0', undefined)).toThrow(BadRequestException);
    expect(() => parseCoreReadPagination('1.5', undefined)).toThrow(BadRequestException);
    expect(() => parseCoreReadPagination('abc', undefined)).toThrow(BadRequestException);
    expect(() => parseCoreReadPagination('', undefined)).toThrow(BadRequestException);
  });

  it('rejects skip overflow beyond safe integer', () => {
    const hugePage = String(Math.floor(Number.MAX_SAFE_INTEGER / 100) + 2);
    expect(() => parseCoreReadPagination(hugePage, '100')).toThrow(BadRequestException);
  });
});
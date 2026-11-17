import type { Request } from 'express';
import { resolveCoreAppM2mTrustBoundaryClientIp } from './core-app-m2m-request-ip.util';

function mockRequest(overrides: Partial<Request>): Request {
  return {
    ip: undefined,
    socket: { remoteAddress: undefined },
    headers: {},
    ...overrides,
  } as Request;
}

describe('resolveCoreAppM2mTrustBoundaryClientIp', () => {
  it('uses req.ip from Express trust boundary, not X-Forwarded-For', () => {
    const req = mockRequest({
      ip: '203.0.113.44',
      headers: { 'x-forwarded-for': '198.51.100.99' },
      socket: { remoteAddress: '127.0.0.1' } as Request['socket'],
    });
    expect(resolveCoreAppM2mTrustBoundaryClientIp(req)).toBe('203.0.113.44');
  });

  it('falls back to socket remoteAddress when req.ip unset', () => {
    const req = mockRequest({
      socket: { remoteAddress: '::ffff:198.51.100.10' } as Request['socket'],
    });
    expect(resolveCoreAppM2mTrustBoundaryClientIp(req)).toBe('198.51.100.10');
  });

  it('returns null when IP cannot be resolved', () => {
    expect(resolveCoreAppM2mTrustBoundaryClientIp(mockRequest({}))).toBeNull();
  });
});
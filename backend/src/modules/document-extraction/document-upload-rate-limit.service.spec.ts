import { DocumentUploadRateLimitService } from './document-upload-rate-limit.service';
import { DocumentUploadRateLimitedException } from './document-upload-rate-limit.errors';

function makeRateLimitService(overrides: {
  config?: Record<string, unknown>;
  redisState?: Map<string, number>;
} = {}) {
  const redisState = overrides.redisState ?? new Map<string, number>();
  const config = {
    uploadRateLimitEnabled: true,
    uploadRateLimitWindowMs: 60_000,
    uploadRateLimitMaxUploadsPerOrg: 3,
    uploadRateLimitMaxBytesPerOrg: 1_000,
    uploadRateLimitMaxUploadsPerUser: 2,
    uploadRateLimitMaxBytesPerUser: 800,
    uploadRateLimitMaxUploadsPerIp: 4,
    uploadRateLimitMaxBytesPerIp: 1_200,
    uploadRateLimitOperatorMultiplier: 2,
    uploadRateLimitAdminMultiplier: 4,
    ...overrides.config,
  };

  const redis = {
    eval: jest.fn(async (_script: string, _numKeys: number, countKey: string, bytesKey: string, maxUploads: string, maxBytes: string, byteIncr: string) => {
      const count = redisState.get(countKey) ?? 0;
      const bytes = redisState.get(bytesKey) ?? 0;
      const nextCount = count + 1;
      const nextBytes = bytes + Number(byteIncr);
      if (nextCount > Number(maxUploads)) return [0, 'count'];
      if (nextBytes > Number(maxBytes)) return [0, 'bytes'];
      redisState.set(countKey, nextCount);
      redisState.set(bytesKey, nextBytes);
      return [1, 'ok'];
    }),
  };

  const observability = {
    recordUploadRateLimited: jest.fn(),
  };

  const svc = new DocumentUploadRateLimitService(
    config as any,
    redis as any,
    observability as any,
  );

  return { svc, redisState, observability, redis };
}

describe('DocumentUploadRateLimitService', () => {
  const baseInput = {
    organizationId: 'org-a',
    userId: 'user-1',
    clientIp: '203.0.113.10',
    sizeBytes: 100,
  };

  it('allows uploads within configured org/user/ip limits', async () => {
    const { svc } = makeRateLimitService();
    await expect(svc.assertAllowed(baseInput)).resolves.toBeUndefined();
    await expect(svc.assertAllowed(baseInput)).resolves.toBeUndefined();
  });

  it('blocks when organization upload count limit is exceeded', async () => {
    const { svc } = makeRateLimitService({
      config: {
        uploadRateLimitMaxUploadsPerOrg: 3,
        uploadRateLimitMaxUploadsPerUser: 100,
        uploadRateLimitMaxUploadsPerIp: 100,
      },
    });
    await svc.assertAllowed(baseInput);
    await svc.assertAllowed(baseInput);
    await svc.assertAllowed(baseInput);
    await expect(svc.assertAllowed(baseInput)).rejects.toMatchObject({
      response: expect.objectContaining({ scope: 'organization', reason: 'count' }),
    });
  });

  it('blocks when organization byte limit is exceeded', async () => {
    const { svc } = makeRateLimitService({
      config: {
        uploadRateLimitMaxUploadsPerOrg: 100,
        uploadRateLimitMaxBytesPerOrg: 250,
        uploadRateLimitMaxUploadsPerUser: 100,
        uploadRateLimitMaxBytesPerUser: 10_000,
        uploadRateLimitMaxUploadsPerIp: 100,
        uploadRateLimitMaxBytesPerIp: 10_000,
      },
    });

    await svc.assertAllowed({ ...baseInput, sizeBytes: 200 });
    await expect(svc.assertAllowed({ ...baseInput, sizeBytes: 100 })).rejects.toMatchObject({
      response: expect.objectContaining({ scope: 'organization', reason: 'bytes' }),
    });
  });

  it('isolates limits per organization', async () => {
    const { svc, redisState } = makeRateLimitService({
      config: {
        uploadRateLimitMaxUploadsPerOrg: 3,
        uploadRateLimitMaxUploadsPerUser: 100,
        uploadRateLimitMaxUploadsPerIp: 100,
      },
    });
    for (let index = 0; index < 3; index += 1) {
      await svc.assertAllowed(baseInput);
    }
    await expect(svc.assertAllowed(baseInput)).rejects.toBeInstanceOf(
      DocumentUploadRateLimitedException,
    );

    await expect(
      svc.assertAllowed({ ...baseInput, organizationId: 'org-b' }),
    ).resolves.toBeUndefined();
    expect([...redisState.keys()].some((key) => key.includes('org-b'))).toBe(true);
  });

  it('resets counters in a new time bucket', async () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(0);
    const { svc } = makeRateLimitService({
      config: {
        uploadRateLimitMaxUploadsPerOrg: 3,
        uploadRateLimitMaxUploadsPerUser: 100,
        uploadRateLimitMaxUploadsPerIp: 100,
      },
    });

    for (let index = 0; index < 3; index += 1) {
      await svc.assertAllowed(baseInput);
    }
    await expect(svc.assertAllowed(baseInput)).rejects.toBeInstanceOf(
      DocumentUploadRateLimitedException,
    );

    nowSpy.mockReturnValue(60_001);
    await expect(svc.assertAllowed(baseInput)).resolves.toBeUndefined();
    nowSpy.mockRestore();
  });

  it('applies higher limits for operator_app uploads', async () => {
    const { svc } = makeRateLimitService({
      config: {
        uploadRateLimitMaxUploadsPerOrg: 3,
        uploadRateLimitMaxUploadsPerUser: 100,
        uploadRateLimitMaxUploadsPerIp: 100,
      },
    });
    const operatorInput = { ...baseInput, uploadSource: 'operator_app' };

    for (let index = 0; index < 6; index += 1) {
      await svc.assertAllowed(operatorInput);
    }
    await expect(svc.assertAllowed(operatorInput)).rejects.toBeInstanceOf(
      DocumentUploadRateLimitedException,
    );
  });

  it('fails open when redis is unavailable', async () => {
    const { svc } = makeRateLimitService();
    (svc as any).redis.eval.mockRejectedValueOnce(new Error('redis down'));
    await expect(svc.assertAllowed(baseInput)).resolves.toBeUndefined();
  });
});

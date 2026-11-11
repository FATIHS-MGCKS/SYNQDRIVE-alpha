import { resolveApdsV3ShadowPhysicalRequestIdentity } from './apds-v3-shadow-physical-identity.v1';

describe('resolveApdsV3ShadowPhysicalRequestIdentity', () => {
  it('CORRELATED enqueue metadata; physical id from BullMQ run boundary', () => {
    const id = resolveApdsV3ShadowPhysicalRequestIdentity(
      {
        id: 'bull-stable',
        attemptsMade: 2,
        data: {
          vehicleId: 'v',
          dimoTokenId: 1,
          apdShadowEnqueueEvidence: {
            attemptId: 'attempt-uuid',
            canonicalJobId: 'snapshot-v',
            binding: 'PHYSICAL_JOB_PAYLOAD',
            outcome: 'ENQUEUED',
            observedAtMs: 1,
          },
        },
      },
      'v',
    );
    expect(id).toEqual({
      physicalRequestId: 'physical-fetch:exec:attempt-uuid:run:2',
      physicalFetchAttemptId: 'physical-fetch:exec:attempt-uuid:run:2',
      enqueueAttemptId: 'attempt-uuid',
      identityClass: 'CORRELATED',
    });
  });

  it('DERIVED from BullMQ job id + attemptsMade when enqueue evidence missing (non-canonical job id)', () => {
    const id = resolveApdsV3ShadowPhysicalRequestIdentity(
      {
        id: 'job-99',
        attemptsMade: 1,
        data: { vehicleId: 'v', dimoTokenId: 2 },
      },
      'v',
    );
    expect(id).toMatchObject({
      identityClass: 'DERIVED',
      physicalRequestId: 'physical-fetch:job-99:run:1',
      enqueueAttemptId: null,
    });
  });

  it('returns null for canonical snapshot job id without admissible enqueue execution anchor', () => {
    expect(
      resolveApdsV3ShadowPhysicalRequestIdentity(
        {
          id: 'snapshot-v',
          attemptsMade: 0,
          data: { vehicleId: 'v', dimoTokenId: 1 },
        },
        'v',
      ),
    ).toBeNull();
  });

  it('A — separate poll cycles: same vehicle/job/attemptsMade, different execution ids', () => {
    const jobShell = {
      id: 'snapshot-v',
      attemptsMade: 0,
      data: { vehicleId: 'v', dimoTokenId: 1 },
    };
    const pollA = resolveApdsV3ShadowPhysicalRequestIdentity(
      {
        ...jobShell,
        data: {
          ...jobShell.data,
          apdShadowEnqueueEvidence: {
            attemptId: 'exec-a',
            canonicalJobId: 'snapshot-v',
            binding: 'PHYSICAL_JOB_PAYLOAD' as const,
            outcome: 'ENQUEUED' as const,
            observedAtMs: 1,
          },
        },
      },
      'v',
    );
    const pollB = resolveApdsV3ShadowPhysicalRequestIdentity(
      {
        ...jobShell,
        data: {
          ...jobShell.data,
          apdShadowEnqueueEvidence: {
            attemptId: 'exec-b',
            canonicalJobId: 'snapshot-v',
            binding: 'PHYSICAL_JOB_PAYLOAD' as const,
            outcome: 'ENQUEUED' as const,
            observedAtMs: 2,
          },
        },
      },
      'v',
    );
    expect(pollA?.physicalRequestId).not.toBe(pollB?.physicalRequestId);
  });

  it('B — same poll execution: identical physical id for delivery replay', () => {
    const job = {
      id: 'snapshot-v',
      attemptsMade: 0,
      data: {
        vehicleId: 'v',
        dimoTokenId: 1,
        apdShadowEnqueueEvidence: {
          attemptId: 'exec-same',
          canonicalJobId: 'snapshot-v',
          binding: 'PHYSICAL_JOB_PAYLOAD' as const,
          outcome: 'ENQUEUED' as const,
          observedAtMs: 1,
        },
      },
    };
    const first = resolveApdsV3ShadowPhysicalRequestIdentity(job, 'v');
    const second = resolveApdsV3ShadowPhysicalRequestIdentity(job, 'v');
    expect(first?.physicalRequestId).toBe(second?.physicalRequestId);
  });

  it('BullMQ retry increments physical fetch attempt id', () => {
    const job = {
      id: 'job-retry',
      data: {
        vehicleId: 'v',
        dimoTokenId: 1,
        apdShadowEnqueueEvidence: {
          attemptId: 'same-enqueue',
          canonicalJobId: 'snapshot-v',
          binding: 'PHYSICAL_JOB_PAYLOAD' as const,
          outcome: 'ENQUEUED' as const,
          observedAtMs: 1,
        },
      },
    };
    const run0 = resolveApdsV3ShadowPhysicalRequestIdentity(
      { ...job, attemptsMade: 0 },
      'v',
    );
    const run1 = resolveApdsV3ShadowPhysicalRequestIdentity(
      { ...job, attemptsMade: 1 },
      'v',
    );
    expect(run0?.physicalRequestId).not.toBe(run1?.physicalRequestId);
    expect(run0?.enqueueAttemptId).toBe('same-enqueue');
    expect(run1?.enqueueAttemptId).toBe('same-enqueue');
  });

  it('returns null when physical identity cannot be derived', () => {
    expect(
      resolveApdsV3ShadowPhysicalRequestIdentity(
        { data: { vehicleId: 'v', dimoTokenId: 1 } },
        'v',
      ),
    ).toBeNull();
  });

  it('rejects inadmissible enqueue evidence (wrong canonical job id)', () => {
    const id = resolveApdsV3ShadowPhysicalRequestIdentity(
      {
        id: 'j1',
        attemptsMade: 0,
        data: {
          vehicleId: 'v',
          dimoTokenId: 1,
          apdShadowEnqueueEvidence: {
            attemptId: 'bad',
            canonicalJobId: 'wrong-id',
            binding: 'PHYSICAL_JOB_PAYLOAD',
            outcome: 'ENQUEUED',
            observedAtMs: 1,
          },
        },
      },
      'v',
    );
    expect(id?.identityClass).toBe('DERIVED');
    expect(id?.enqueueAttemptId).toBeNull();
  });
});

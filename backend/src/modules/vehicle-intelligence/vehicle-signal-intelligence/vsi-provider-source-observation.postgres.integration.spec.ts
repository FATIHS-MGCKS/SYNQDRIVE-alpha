/**
 * VSI-03 P2C PostgreSQL certification (disposable DB only).
 *   bash scripts/test/vsi03-p2c-postgres-ci.sh
 */
import {
  PrismaClient,
  VehicleProviderSourceObservationOutcome,
  VehicleProviderSourceObservationRecordPhase,
  VehicleProviderSourceTimestampProvenance,
} from '@prisma/client';
import { assertVsi03DisposablePostgresTarget } from './vsi-readonly-composer.postgres-guard';
import {
  buildProviderSourceObservationScope,
  counterScopeUniqueWhere,
} from './vsi-provider-source-observation.scope';
import { VsiProviderSourceObservationRepository } from './vsi-provider-source-observation.repository';
import {
  buildDimoSnapshotFetchObservationIdempotencyKey,
  buildDimoSnapshotVlsApplicationIdempotencyKey,
  VsiProviderSourceObservationWriterService,
} from './vsi-provider-source-observation.writer.service';
import {
  cleanupVsiP2cObservationFixture,
  createVsiP2cObservationFixture,
  type VsiP2cObservationFixture,
} from './vsi-p2c-postgres.fixture';
import { evaluateStrictSourceAdvanceFromObservations } from './vsi-strict-source-advance.resolver';
import { VsiStrictSourceAdvanceService } from './vsi-strict-source-advance.service';
import {
  applyVsi03P2cCapturePilotEnv,
  clearVsi03P2cCapturePilotEnv,
} from './vsi03-p2c-capture-test-env';

const LIVE = process.env.VSI03_READONLY_COMPOSER_PG === '1';

function scopeKeys(scopeKey: string, token: string) {
  return { providerBindingScopeKey: scopeKey, providerTokenScopeKey: token };
}

function continuityInput(
  f: VsiP2cObservationFixture,
  scopeKey: string,
  token: string,
) {
  return {
    organizationId: f.organizationId,
    vehicleId: f.vehicleId,
    provider: 'DIMO',
    ...scopeKeys(scopeKey, token),
  };
}

async function insertFetchRow(
  prisma: PrismaClient,
  input: {
    f: VsiP2cObservationFixture;
    scopeKey: string;
    token: string;
    observationIndex: bigint;
    idempotencyKey: string;
    fetchCorrelationId: string;
    providerFetchedAt: Date;
    providerSourceTimestamp: Date;
    outcome: VehicleProviderSourceObservationOutcome;
  },
) {
  await prisma.vehicleProviderSourceObservation.create({
    data: {
      organizationId: input.f.organizationId,
      vehicleId: input.f.vehicleId,
      provider: 'DIMO',
      providerBindingId: input.scopeKey,
      providerBindingScopeKey: input.scopeKey,
      providerTokenReference: input.token,
      providerTokenScopeKey: input.token,
      pollJobId: `poll-${input.observationIndex}`,
      bullmqAttemptNumber: 0,
      fetchCorrelationId: input.fetchCorrelationId,
      recordPhase: VehicleProviderSourceObservationRecordPhase.PROVIDER_FETCH,
      idempotencyKey: input.idempotencyKey,
      observationIndex: input.observationIndex,
      providerFetchedAt: input.providerFetchedAt,
      providerSourceTimestamp: input.providerSourceTimestamp,
      sourceTimestampProvenance: VehicleProviderSourceTimestampProvenance.PROVIDER_LAST_SEEN,
      observationOutcome: input.outcome,
    },
  });
}

(LIVE ? describe : describe.skip)('VSI03 P2C observation ledger (PostgreSQL certification)', () => {
  const prisma = new PrismaClient();
  const writer = new VsiProviderSourceObservationWriterService(prisma as never);
  const repo = new VsiProviderSourceObservationRepository(prisma as never);
  const orgIds: string[] = [];

  beforeAll(() => {
    assertVsi03DisposablePostgresTarget();
    process.env.VSI03_P2C_STRICT_ADVANCE_FROM_OBSERVATIONS_ENABLED = 'true';
  });

  afterEach(async () => {
    while (orgIds.length > 0) {
      const orgId = orgIds.pop();
      if (orgId) {
        await cleanupVsiP2cObservationFixture(prisma, orgId);
      }
    }
  });

  afterAll(async () => {
    clearVsi03P2cCapturePilotEnv();
    delete process.env.VSI03_P2C_STRICT_ADVANCE_FROM_OBSERVATIONS_ENABLED;
    await prisma.$disconnect();
  });

  async function freshFixture(): Promise<VsiP2cObservationFixture> {
    const f = await createVsiP2cObservationFixture(prisma);
    orgIds.push(f.organizationId);
    applyVsi03P2cCapturePilotEnv({
      organizationId: f.organizationId,
      vehicleId: f.vehicleId,
    });
    return f;
  }

  it('1 concurrent first allocation on empty scope', async () => {
    const f = await freshFixture();
    const scopeKey = `scope-first-${Date.now()}`;
    const token = `tok-${Date.now()}`;
    const scope = buildProviderSourceObservationScope({
      organizationId: f.organizationId,
      vehicleId: f.vehicleId,
      provider: 'DIMO',
      providerBindingId: scopeKey,
      providerTokenReference: token,
    });
    const indices = await Promise.all(
      Array.from({ length: 8 }, () => writer.allocateObservationIndex(scope)),
    );
    expect(indices.length).toBe(8);
    expect(new Set(indices.map(String)).size).toBe(8);
    const sorted = [...indices].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(sorted).toEqual([1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n]);
  });

  it('2 parallel allocations on established scope via recordProviderFetch', async () => {
    const f = await freshFixture();
    const scopeKey = f.linkId;
    const token = f.providerTokenReference;
    const results = await Promise.all(
      [0, 1, 2, 3].map((attempt) => {
        const fetchCorrelationId = `corr-est-${attempt}-${Date.now()}`;
        return writer.recordProviderFetch({
          organizationId: f.organizationId,
          vehicleId: f.vehicleId,
          provider: 'DIMO',
          providerBindingId: scopeKey,
          providerTokenReference: token,
          pollJobId: `est-${attempt}-${Date.now()}`,
          bullmqAttemptNumber: attempt,
          fetchCorrelationId,
          idempotencyKey: buildDimoSnapshotFetchObservationIdempotencyKey(fetchCorrelationId),
          providerFetchedAt: new Date(`2026-10-14T12:00:0${attempt}.000Z`),
          providerSourceTimestamp: new Date('2026-10-14T11:00:00.000Z'),
          monotonicStaleSkipped: false,
        });
      }),
    );
    const indices = results.map((r) => r?.observationIndex).filter(Boolean) as bigint[];
    expect(indices).toHaveLength(4);
    expect(new Set(indices.map(String)).size).toBe(4);
  });

  it('3 counter advances but latest observation row missing → UNKNOWN gate', async () => {
    const f = await freshFixture();
    const scopeKey = `gap-missing-${Date.now()}`;
    const token = `gap-${Date.now()}`;
    const scope = buildProviderSourceObservationScope({
      organizationId: f.organizationId,
      vehicleId: f.vehicleId,
      provider: 'DIMO',
      providerBindingId: scopeKey,
      providerTokenReference: token,
    });
    const i1 = await writer.allocateObservationIndex(scope);
    await insertFetchRow(prisma, {
      f,
      scopeKey,
      token,
      observationIndex: i1,
      idempotencyKey: `k1-${Date.now()}`,
      fetchCorrelationId: 'c1',
      providerFetchedAt: new Date('2026-10-14T10:00:01.000Z'),
      providerSourceTimestamp: new Date('2026-10-14T10:00:00.000Z'),
      outcome: VehicleProviderSourceObservationOutcome.PROVIDER_FETCH_RECORDED,
    });
    const i2 = await writer.allocateObservationIndex(scope);
    await insertFetchRow(prisma, {
      f,
      scopeKey,
      token,
      observationIndex: i2,
      idempotencyKey: `k2-${Date.now()}`,
      fetchCorrelationId: 'c2',
      providerFetchedAt: new Date('2026-10-14T11:00:01.000Z'),
      providerSourceTimestamp: new Date('2026-10-14T11:00:00.000Z'),
      outcome: VehicleProviderSourceObservationOutcome.PROVIDER_FETCH_RECORDED,
    });
    await writer.allocateObservationIndex(scope);

    const continuity = await repo.loadFetchObservationContinuity(continuityInput(f, scopeKey, token));
    expect(continuity.continuityBlockers).toContain('COUNTER_ALLOCATED_HEAD_MISSING_OBSERVATION');
    expect(continuity.latest).toBeNull();
  });

  it('4 newest PERSISTENCE_FAILED tombstone after two successes abstains', async () => {
    const f = await freshFixture();
    const scopeKey = `fail-head-${Date.now()}`;
    const token = `fh-${Date.now()}`;
    await insertFetchRow(prisma, {
      f,
      scopeKey,
      token,
      observationIndex: 1n,
      idempotencyKey: `ok-1-${Date.now()}`,
      fetchCorrelationId: 'ok-1',
      providerFetchedAt: new Date('2026-10-14T10:00:01.000Z'),
      providerSourceTimestamp: new Date('2026-10-14T10:00:00.000Z'),
      outcome: VehicleProviderSourceObservationOutcome.PROVIDER_FETCH_RECORDED,
    });
    await insertFetchRow(prisma, {
      f,
      scopeKey,
      token,
      observationIndex: 2n,
      idempotencyKey: `ok-2-${Date.now()}`,
      fetchCorrelationId: 'ok-2',
      providerFetchedAt: new Date('2026-10-14T11:00:01.000Z'),
      providerSourceTimestamp: new Date('2026-10-14T11:00:00.000Z'),
      outcome: VehicleProviderSourceObservationOutcome.PROVIDER_FETCH_RECORDED,
    });
    await insertFetchRow(prisma, {
      f,
      scopeKey,
      token,
      observationIndex: 3n,
      idempotencyKey: `fail-${Date.now()}`,
      fetchCorrelationId: 'fail-3',
      providerFetchedAt: new Date('2026-10-14T12:00:01.000Z'),
      providerSourceTimestamp: new Date('2026-10-14T12:00:00.000Z'),
      outcome: VehicleProviderSourceObservationOutcome.PERSISTENCE_FAILED,
    });
    await prisma.vehicleProviderSourceObservationCounter.create({
      data: {
        organizationId: f.organizationId,
        vehicleId: f.vehicleId,
        provider: 'DIMO',
        providerBindingScopeKey: scopeKey,
        providerTokenScopeKey: token,
        nextObservationIndex: 4n,
      },
    });

    const continuity = await repo.loadFetchObservationContinuity(continuityInput(f, scopeKey, token));
    expect(continuity.continuityBlockers).toContain('NEWEST_FETCH_OBSERVATION_PERSISTENCE_FAILED');
    expect(continuity.latest).toBeNull();
  });

  it('5 failed tombstone written after allocated index (writer path)', async () => {
    const f = await freshFixture();
    const scopeKey = `tomb-${Date.now()}`;
    const token = `tb-${Date.now()}`;
    const scope = buildProviderSourceObservationScope({
      organizationId: f.organizationId,
      vehicleId: f.vehicleId,
      provider: 'DIMO',
      providerBindingId: scopeKey,
      providerTokenReference: token,
    });
    const idx = await writer.allocateObservationIndex(scope);
    await prisma.vehicleProviderSourceObservation.create({
      data: {
        organizationId: f.organizationId,
        vehicleId: f.vehicleId,
        provider: 'DIMO',
        providerBindingId: scopeKey,
        providerBindingScopeKey: scopeKey,
        providerTokenReference: token,
        providerTokenScopeKey: token,
        pollJobId: 'tomb-job',
        bullmqAttemptNumber: 0,
        fetchCorrelationId: 'tomb-corr',
        recordPhase: VehicleProviderSourceObservationRecordPhase.PROVIDER_FETCH,
        idempotencyKey: `tombstone-${Date.now()}`,
        observationIndex: idx,
        providerFetchedAt: new Date(),
        providerSourceTimestamp: new Date(),
        sourceTimestampProvenance: VehicleProviderSourceTimestampProvenance.PROVIDER_LAST_SEEN,
        observationOutcome: VehicleProviderSourceObservationOutcome.PERSISTENCE_FAILED,
      },
    });
    const row = await prisma.vehicleProviderSourceObservation.findFirst({
      where: { observationIndex: idx, observationOutcome: 'PERSISTENCE_FAILED' },
    });
    expect(row).not.toBeNull();
  });

  it('6 worker restart uses same durable counter state', async () => {
    const f = await freshFixture();
    const scopeKey = `restart-${Date.now()}`;
    const token = `rs-${Date.now()}`;
    const writerA = new VsiProviderSourceObservationWriterService(prisma as never);
    const writerB = new VsiProviderSourceObservationWriterService(prisma as never);
    const scope = buildProviderSourceObservationScope({
      organizationId: f.organizationId,
      vehicleId: f.vehicleId,
      provider: 'DIMO',
      providerBindingId: scopeKey,
      providerTokenReference: token,
    });
    const a = await writerA.allocateObservationIndex(scope);
    const b = await writerB.allocateObservationIndex(scope);
    expect(b).toBe(a + 1n);
  });

  it('7 same fetchCorrelationId idempotent; independent fetches distinct indices', async () => {
    const f = await freshFixture();
    const job = `snapshot-${f.vehicleId}`;
    const correlationA = `idem-a-${Date.now()}`;
    const base = {
      organizationId: f.organizationId,
      vehicleId: f.vehicleId,
      provider: 'DIMO',
      providerBindingId: f.linkId,
      providerTokenReference: f.providerTokenReference,
      pollJobId: job,
      bullmqAttemptNumber: 0,
      providerFetchedAt: new Date(),
      providerSourceTimestamp: new Date('2026-10-14T10:00:00.000Z'),
      monotonicStaleSkipped: false,
    };
    const first = await writer.recordProviderFetch({
      ...base,
      fetchCorrelationId: correlationA,
      idempotencyKey: buildDimoSnapshotFetchObservationIdempotencyKey(correlationA),
    });
    const dup = await writer.recordProviderFetch({
      ...base,
      fetchCorrelationId: correlationA,
      idempotencyKey: buildDimoSnapshotFetchObservationIdempotencyKey(correlationA),
    });
    const correlationB = `idem-b-${Date.now()}`;
    const secondPoll = await writer.recordProviderFetch({
      ...base,
      fetchCorrelationId: correlationB,
      idempotencyKey: buildDimoSnapshotFetchObservationIdempotencyKey(correlationB),
    });
    expect(dup?.observationIndex).toBe(first?.observationIndex);
    expect(secondPoll?.observationIndex).not.toBe(first?.observationIndex);
    const fetchRows = await prisma.vehicleProviderSourceObservation.count({
      where: {
        vehicleId: f.vehicleId,
        recordPhase: VehicleProviderSourceObservationRecordPhase.PROVIDER_FETCH,
        fetchCorrelationId: { in: [correlationA, correlationB] },
      },
    });
    expect(fetchRows).toBe(2);
  });

  it('P2C idempotency A–D: independent snapshot polls, VLS parity, replay, counter head', async () => {
    const f = await freshFixture();
    const stableJobId = `snapshot-${f.vehicleId}`;
    const pollCount = 5;
    const correlations: string[] = [];
    const indices: bigint[] = [];

    for (let i = 0; i < pollCount; i++) {
      const fetchCorrelationId = `poll-corr-${i}-${Date.now()}`;
      correlations.push(fetchCorrelationId);
      const fetch = await writer.recordProviderFetch({
        organizationId: f.organizationId,
        vehicleId: f.vehicleId,
        provider: 'DIMO',
        providerBindingId: f.linkId,
        providerTokenReference: f.providerTokenReference,
        pollJobId: stableJobId,
        bullmqAttemptNumber: 0,
        fetchCorrelationId,
        idempotencyKey: buildDimoSnapshotFetchObservationIdempotencyKey(fetchCorrelationId),
        providerFetchedAt: new Date(`2026-10-14T14:00:0${i}.000Z`),
        providerSourceTimestamp: new Date(`2026-10-14T13:00:0${i}.000Z`),
        monotonicStaleSkipped: false,
      });
      expect(fetch?.observationIndex).toBeDefined();
      indices.push(fetch!.observationIndex);
      await writer.recordVlsApplication({
        organizationId: f.organizationId,
        vehicleId: f.vehicleId,
        provider: 'DIMO',
        providerBindingId: f.linkId,
        providerTokenReference: f.providerTokenReference,
        pollJobId: stableJobId,
        fetchCorrelationId,
        observationIndex: fetch!.observationIndex,
        providerFetchedAt: new Date(`2026-10-14T14:00:0${i}.000Z`),
        providerSourceTimestamp: new Date(`2026-10-14T13:00:0${i}.000Z`),
        idempotencyKey: buildDimoSnapshotVlsApplicationIdempotencyKey(fetchCorrelationId),
      });
    }

    expect(new Set(indices.map(String)).size).toBe(pollCount);

    const replay = await writer.recordProviderFetch({
      organizationId: f.organizationId,
      vehicleId: f.vehicleId,
      provider: 'DIMO',
      providerBindingId: f.linkId,
      providerTokenReference: f.providerTokenReference,
      pollJobId: stableJobId,
      bullmqAttemptNumber: 0,
      fetchCorrelationId: correlations[0],
      idempotencyKey: buildDimoSnapshotFetchObservationIdempotencyKey(correlations[0]),
      providerFetchedAt: new Date(`2026-10-14T14:00:00.000Z`),
      providerSourceTimestamp: new Date('2026-10-14T13:00:00.000Z'),
      monotonicStaleSkipped: false,
    });
    expect(replay?.observationIndex).toBe(indices[0]);

    const fetchRowCount = await prisma.vehicleProviderSourceObservation.count({
      where: {
        vehicleId: f.vehicleId,
        recordPhase: VehicleProviderSourceObservationRecordPhase.PROVIDER_FETCH,
      },
    });
    const vlsRowCount = await prisma.vehicleProviderSourceObservation.count({
      where: {
        vehicleId: f.vehicleId,
        recordPhase: VehicleProviderSourceObservationRecordPhase.VLS_APPLICATION,
      },
    });
    expect(fetchRowCount).toBe(pollCount);
    expect(vlsRowCount).toBe(pollCount);

    const scope = buildProviderSourceObservationScope({
      organizationId: f.organizationId,
      vehicleId: f.vehicleId,
      provider: 'DIMO',
      providerBindingId: f.linkId,
      providerTokenReference: f.providerTokenReference,
    });
    const counter = await prisma.vehicleProviderSourceObservationCounter.findUnique({
      where: counterScopeUniqueWhere(scope),
    });
    expect(counter?.nextObservationIndex).toBe(BigInt(pollCount) + 1n);
  });

  it('8 observations committed out of chronological insert order', async () => {
    const f = await freshFixture();
    const scopeKey = `ooo-${Date.now()}`;
    const token = `ooo-${Date.now()}`;
    await insertFetchRow(prisma, {
      f,
      scopeKey,
      token,
      observationIndex: 2n,
      idempotencyKey: `ooo-2-${Date.now()}`,
      fetchCorrelationId: 'ooo-2',
      providerFetchedAt: new Date('2026-10-14T12:00:01.000Z'),
      providerSourceTimestamp: new Date('2026-10-14T12:00:00.000Z'),
      outcome: VehicleProviderSourceObservationOutcome.PROVIDER_FETCH_RECORDED,
    });
    await insertFetchRow(prisma, {
      f,
      scopeKey,
      token,
      observationIndex: 1n,
      idempotencyKey: `ooo-1-${Date.now()}`,
      fetchCorrelationId: 'ooo-1',
      providerFetchedAt: new Date('2026-10-14T11:00:01.000Z'),
      providerSourceTimestamp: new Date('2026-10-14T11:00:00.000Z'),
      outcome: VehicleProviderSourceObservationOutcome.PROVIDER_FETCH_RECORDED,
    });
    await prisma.vehicleProviderSourceObservationCounter.create({
      data: {
        organizationId: f.organizationId,
        vehicleId: f.vehicleId,
        provider: 'DIMO',
        providerBindingScopeKey: scopeKey,
        providerTokenScopeKey: token,
        nextObservationIndex: 3n,
      },
    });
    const continuity = await repo.loadFetchObservationContinuity(continuityInput(f, scopeKey, token));
    expect(continuity.latest?.observationIndex).toBe(2n);
    expect(continuity.previous?.observationIndex).toBe(1n);
    expect(continuity.continuityIntact).toBe(true);
  });

  it('9 valid VLS context cannot advance when counter head missing', async () => {
    const f = await freshFixture();
    const scopeKey = `vls-miss-${Date.now()}`;
    const token = `vm-${Date.now()}`;
    const scope = buildProviderSourceObservationScope({
      organizationId: f.organizationId,
      vehicleId: f.vehicleId,
      provider: 'DIMO',
      providerBindingId: scopeKey,
      providerTokenReference: token,
    });
    await writer.allocateObservationIndex(scope);
    await insertFetchRow(prisma, {
      f,
      scopeKey,
      token,
      observationIndex: 1n,
      idempotencyKey: `vm1-${Date.now()}`,
      fetchCorrelationId: 'vm1',
      providerFetchedAt: new Date('2026-10-14T10:00:01.000Z'),
      providerSourceTimestamp: new Date('2026-10-14T10:00:00.000Z'),
      outcome: VehicleProviderSourceObservationOutcome.PROVIDER_FETCH_RECORDED,
    });
    const continuity = await repo.loadFetchObservationContinuity(continuityInput(f, scopeKey, token));
    const evalResult = evaluateStrictSourceAdvanceFromObservations({
      scopeProvider: 'DIMO',
      scopeBindingId: scopeKey,
      scopeTokenReference: token,
      latestState: {
        providerBindingId: scopeKey,
        providerSource: 'DIMO',
        sourceTimestamp: new Date('2026-10-14T10:00:00.000Z'),
        providerFetchedAt: new Date('2026-10-14T10:00:01.000Z'),
      },
      latest: continuity.latest,
      previous: continuity.previous,
      continuityIntact: continuity.continuityIntact,
      latestVlsApplicationProven: true,
      continuityBlockers: continuity.continuityBlockers,
    });
    expect(evalResult.classification).toBe('UNKNOWN');
    expect(evalResult.advanceEvidenceScope).toBe('NONE');
  });

  it('14 missing counter authority with consecutive fetch rows abstains', async () => {
    const f = await freshFixture();
    const scopeKey = `no-counter-${Date.now()}`;
    const token = `nc-${Date.now()}`;
    await insertFetchRow(prisma, {
      f,
      scopeKey,
      token,
      observationIndex: 1n,
      idempotencyKey: `nc-1-${Date.now()}`,
      fetchCorrelationId: 'nc-1',
      providerFetchedAt: new Date('2026-10-14T10:00:01.000Z'),
      providerSourceTimestamp: new Date('2026-10-14T10:00:00.000Z'),
      outcome: VehicleProviderSourceObservationOutcome.PROVIDER_FETCH_RECORDED,
    });
    await insertFetchRow(prisma, {
      f,
      scopeKey,
      token,
      observationIndex: 2n,
      idempotencyKey: `nc-2-${Date.now()}`,
      fetchCorrelationId: 'nc-2',
      providerFetchedAt: new Date('2026-10-14T11:00:01.000Z'),
      providerSourceTimestamp: new Date('2026-10-14T11:00:00.000Z'),
      outcome: VehicleProviderSourceObservationOutcome.PROVIDER_FETCH_RECORDED,
    });

    const continuity = await repo.loadFetchObservationContinuity(continuityInput(f, scopeKey, token));
    expect(continuity.continuityBlockers).toContain('OBSERVATION_COUNTER_AUTHORITY_MISSING');
    expect(continuity.latest).toBeNull();
    expect(continuity.previous).toBeNull();

    const evalResult = evaluateStrictSourceAdvanceFromObservations({
      scopeProvider: 'DIMO',
      scopeBindingId: scopeKey,
      scopeTokenReference: token,
      latestState: {
        providerBindingId: scopeKey,
        providerSource: 'DIMO',
        sourceTimestamp: new Date('2026-10-14T11:00:00.000Z'),
        providerFetchedAt: new Date('2026-10-14T11:00:01.000Z'),
      },
      latest: continuity.latest,
      previous: continuity.previous,
      continuityIntact: continuity.continuityIntact,
      latestVlsApplicationProven: false,
      continuityBlockers: continuity.continuityBlockers,
    });
    expect(evalResult.classification).toBe('UNKNOWN');
    expect(evalResult.reasons).toContain('OBSERVATION_COUNTER_AUTHORITY_MISSING');
  });

  it('14b deleted counter after durable writes abstains', async () => {
    const f = await freshFixture();
    const scopeKey = f.linkId;
    const token = f.providerTokenReference;
    await writer.recordProviderFetch({
      organizationId: f.organizationId,
      vehicleId: f.vehicleId,
      provider: 'DIMO',
      providerBindingId: scopeKey,
      providerTokenReference: token,
      pollJobId: `del-c1-${Date.now()}`,
      bullmqAttemptNumber: 0,
      fetchCorrelationId: 'del-c1',
      idempotencyKey: buildDimoSnapshotFetchObservationIdempotencyKey('del-c1'),
      providerFetchedAt: new Date('2026-10-14T10:00:01.000Z'),
      providerSourceTimestamp: new Date('2026-10-14T10:00:00.000Z'),
      monotonicStaleSkipped: false,
    });
    await writer.recordProviderFetch({
      organizationId: f.organizationId,
      vehicleId: f.vehicleId,
      provider: 'DIMO',
      providerBindingId: scopeKey,
      providerTokenReference: token,
      pollJobId: `del-c2-${Date.now()}`,
      bullmqAttemptNumber: 0,
      fetchCorrelationId: 'del-c2',
      idempotencyKey: buildDimoSnapshotFetchObservationIdempotencyKey('del-c2'),
      providerFetchedAt: new Date('2026-10-14T11:00:01.000Z'),
      providerSourceTimestamp: new Date('2026-10-14T11:00:00.000Z'),
      monotonicStaleSkipped: false,
    });
    await prisma.vehicleProviderSourceObservationCounter.deleteMany({
      where: {
        organizationId: f.organizationId,
        vehicleId: f.vehicleId,
        provider: 'DIMO',
        providerBindingScopeKey: scopeKey,
        providerTokenScopeKey: token,
      },
    });

    const continuity = await repo.loadFetchObservationContinuity(continuityInput(f, scopeKey, token));
    expect(continuity.continuityBlockers).toContain('OBSERVATION_COUNTER_AUTHORITY_MISSING');
    expect(continuity.latest).toBeNull();
  });

  it('10 pruning middle observation breaks pair continuity', async () => {
    const f = await freshFixture();
    const scopeKey = `prune-${Date.now()}`;
    const token = `pr-${Date.now()}`;
    for (const idx of [1n, 2n, 3n]) {
      await insertFetchRow(prisma, {
        f,
        scopeKey,
        token,
        observationIndex: idx,
        idempotencyKey: `pr-${idx}-${Date.now()}`,
        fetchCorrelationId: `pr-${idx}`,
        providerFetchedAt: new Date(`2026-10-14T1${idx}:00:01.000Z`),
        providerSourceTimestamp: new Date(`2026-10-14T1${idx}:00:00.000Z`),
        outcome: VehicleProviderSourceObservationOutcome.PROVIDER_FETCH_RECORDED,
      });
    }
    await prisma.vehicleProviderSourceObservation.deleteMany({
      where: { providerBindingScopeKey: scopeKey, observationIndex: 2n },
    });
    await prisma.vehicleProviderSourceObservationCounter.create({
      data: {
        organizationId: f.organizationId,
        vehicleId: f.vehicleId,
        provider: 'DIMO',
        providerBindingScopeKey: scopeKey,
        providerTokenScopeKey: token,
        nextObservationIndex: 4n,
      },
    });
    const continuity = await repo.loadFetchObservationContinuity(continuityInput(f, scopeKey, token));
    expect(continuity.latest?.observationIndex).toBe(3n);
    expect(continuity.previous?.observationIndex).toBe(1n);
    expect(continuity.continuityIntact).toBe(false);
  });

  it('11 cross-tenant and cross-binding isolation', async () => {
    const fA = await freshFixture();
    const fB = await freshFixture();
    const sharedToken = 'shared-token';
    const scopeA = `bind-a-${Date.now()}`;
    const scopeB = `bind-b-${Date.now()}`;
    await insertFetchRow(prisma, {
      f: fA,
      scopeKey: scopeA,
      token: sharedToken,
      observationIndex: 1n,
      idempotencyKey: `iso-a-${Date.now()}`,
      fetchCorrelationId: 'iso-a',
      providerFetchedAt: new Date(),
      providerSourceTimestamp: new Date(),
      outcome: VehicleProviderSourceObservationOutcome.PROVIDER_FETCH_RECORDED,
    });
    await insertFetchRow(prisma, {
      f: fB,
      scopeKey: scopeB,
      token: sharedToken,
      observationIndex: 1n,
      idempotencyKey: `iso-b-${Date.now()}`,
      fetchCorrelationId: 'iso-b',
      providerFetchedAt: new Date(),
      providerSourceTimestamp: new Date(),
      outcome: VehicleProviderSourceObservationOutcome.PROVIDER_FETCH_RECORDED,
    });
    for (const [fixture, scopeKey] of [[fA, scopeA], [fB, scopeB]] as const) {
      await prisma.vehicleProviderSourceObservationCounter.create({
        data: {
          organizationId: fixture.organizationId,
          vehicleId: fixture.vehicleId,
          provider: 'DIMO',
          providerBindingScopeKey: scopeKey,
          providerTokenScopeKey: sharedToken,
          nextObservationIndex: 2n,
        },
      });
    }
    const crossLeak = await prisma.vehicleProviderSourceObservation.count({
      where: { organizationId: fA.organizationId, providerBindingScopeKey: scopeB },
    });
    expect(crossLeak).toBe(0);

    const cA = await repo.loadFetchObservationContinuity(continuityInput(fA, scopeA, sharedToken));
    const cB = await repo.loadFetchObservationContinuity(continuityInput(fB, scopeB, sharedToken));
    expect(cA.latest?.organizationId).toBe(fA.organizationId);
    expect(cB.latest?.organizationId).toBe(fB.organizationId);
    expect(cA.continuityBlockers).toHaveLength(0);
    expect(cB.continuityBlockers).toHaveLength(0);
    expect(cA.previous).toBeNull();
    expect(cB.previous).toBeNull();
  });

  it('12 stale-skip at head yields NOT_ADVANCED not ADVANCED', async () => {
    const f = await freshFixture();
    const scopeKey = `stale-${Date.now()}`;
    const token = `st-${Date.now()}`;
    const t = new Date('2026-10-14T15:00:00.000Z');
    const fetchAt = new Date('2026-10-14T15:00:01.000Z');
    await insertFetchRow(prisma, {
      f,
      scopeKey,
      token,
      observationIndex: 1n,
      idempotencyKey: `st1-${Date.now()}`,
      fetchCorrelationId: 'st1',
      providerFetchedAt: new Date('2026-10-14T14:59:01.000Z'),
      providerSourceTimestamp: t,
      outcome: VehicleProviderSourceObservationOutcome.PROVIDER_FETCH_RECORDED,
    });
    await insertFetchRow(prisma, {
      f,
      scopeKey,
      token,
      observationIndex: 2n,
      idempotencyKey: `st2-${Date.now()}`,
      fetchCorrelationId: 'st2',
      providerFetchedAt: fetchAt,
      providerSourceTimestamp: t,
      outcome: VehicleProviderSourceObservationOutcome.MONOTONIC_STALE_SKIPPED,
    });
    await prisma.vehicleProviderSourceObservationCounter.create({
      data: {
        organizationId: f.organizationId,
        vehicleId: f.vehicleId,
        provider: 'DIMO',
        providerBindingScopeKey: scopeKey,
        providerTokenScopeKey: token,
        nextObservationIndex: 3n,
      },
    });
    const continuity = await repo.loadFetchObservationContinuity(continuityInput(f, scopeKey, token));
    const evalResult = evaluateStrictSourceAdvanceFromObservations({
      scopeProvider: 'DIMO',
      scopeBindingId: scopeKey,
      scopeTokenReference: token,
      latestState: {
        providerBindingId: scopeKey,
        providerSource: 'DIMO',
        sourceTimestamp: t,
        providerFetchedAt: fetchAt,
      },
      latest: continuity.latest,
      previous: continuity.previous,
      continuityIntact: continuity.continuityIntact,
      latestVlsApplicationProven: continuity.latestVlsApplicationProven,
      continuityBlockers: continuity.continuityBlockers,
    });
    expect(evalResult.classification).toBe('NOT_ADVANCED');
    expect(evalResult.advanceEvidenceScope).toBe('LATEST_RECORDED_OBSERVATION_PAIR');
  });

  it('13 capture flag OFF is runtime no-op', async () => {
    const f = await freshFixture();
    clearVsi03P2cCapturePilotEnv();
    const noopWriter = new VsiProviderSourceObservationWriterService(prisma as never);
    const result = await noopWriter.recordProviderFetch({
      organizationId: f.organizationId,
      vehicleId: f.vehicleId,
      provider: 'DIMO',
      providerBindingId: f.linkId,
      providerTokenReference: f.providerTokenReference,
      pollJobId: 'flag-off',
      bullmqAttemptNumber: 0,
      fetchCorrelationId: 'flag-off',
      idempotencyKey: buildDimoSnapshotFetchObservationIdempotencyKey('flag-off'),
      providerFetchedAt: new Date(),
      providerSourceTimestamp: new Date(),
      monotonicStaleSkipped: false,
    });
    expect(result).toBeNull();
    const count = await prisma.vehicleProviderSourceObservation.count({
      where: { vehicleId: f.vehicleId },
    });
    expect(count).toBe(0);
    applyVsi03P2cCapturePilotEnv({
      organizationId: f.organizationId,
      vehicleId: f.vehicleId,
    });
  });

  it('records fetch then VLS application for same correlation', async () => {
    const f = await freshFixture();
    const correlation = `corr-${Date.now()}`;
    const job = `job-${Date.now()}`;
    const fetch = await writer.recordProviderFetch({
      organizationId: f.organizationId,
      vehicleId: f.vehicleId,
      provider: 'DIMO',
      providerBindingId: f.linkId,
      providerTokenReference: f.providerTokenReference,
      pollJobId: job,
      bullmqAttemptNumber: 0,
      fetchCorrelationId: correlation,
      idempotencyKey: buildDimoSnapshotFetchObservationIdempotencyKey(correlation),
      providerFetchedAt: new Date('2026-10-14T14:00:05.000Z'),
      providerSourceTimestamp: new Date('2026-10-14T14:00:00.000Z'),
      monotonicStaleSkipped: false,
    });
    expect(fetch?.observationIndex).toBeDefined();
    await writer.recordVlsApplication({
      organizationId: f.organizationId,
      vehicleId: f.vehicleId,
      provider: 'DIMO',
      providerBindingId: f.linkId,
      providerTokenReference: f.providerTokenReference,
      pollJobId: job,
      fetchCorrelationId: correlation,
      observationIndex: fetch!.observationIndex,
      providerFetchedAt: new Date('2026-10-14T14:00:05.000Z'),
      providerSourceTimestamp: new Date('2026-10-14T14:00:00.000Z'),
      idempotencyKey: buildDimoSnapshotVlsApplicationIdempotencyKey(correlation),
    });
    const phases = await prisma.vehicleProviderSourceObservation.findMany({
      where: { fetchCorrelationId: correlation },
      orderBy: { recordPhase: 'asc' },
    });
    expect(phases.map((p) => p.recordPhase)).toEqual(['PROVIDER_FETCH', 'VLS_APPLICATION']);
  });

  it('strict advance service abstains when P2C read flag disabled', async () => {
    const f = await freshFixture();
    delete process.env.VSI03_P2C_STRICT_ADVANCE_FROM_OBSERVATIONS_ENABLED;
    const svc = new VsiStrictSourceAdvanceService(repo);
    const r = await svc.evaluateForLink({
      organizationId: f.organizationId,
      vehicleId: f.vehicleId,
      link: {
        id: f.linkId,
        provider: 'DIMO',
        isActive: true,
        metadata: {},
        scopedOrgProviderConsentValid: true,
      },
      latestState: null,
      dimoTokenReference: f.providerTokenReference,
    });
    expect(r.reasons).toContain('P2C_STRICT_ADVANCE_READ_DISABLED');
    process.env.VSI03_P2C_STRICT_ADVANCE_FROM_OBSERVATIONS_ENABLED = 'true';
  });
});

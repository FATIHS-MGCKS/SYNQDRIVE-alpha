import {
  APD_SHADOW_COHORT_MAX_MEMBERS,
  buildApdShadowTenantMemoryKey,
  computeApdShadowCohortFingerprintSha256,
  isApdShadowCohortMember,
  parseApdShadowCohortRuntime,
  P25_APD_LTE_R1_COHORT_V1,
  WORKER_APD_SHADOW_COHORT_JSON_ENV,
  type ApdShadowCohortConfig,
} from './adaptive-polling-shadow-cohort.config';

const ORG = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const V1 = '68868291-5478-42cd-b0c4-cc77b2a78e21';
const V2 = 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63';
const STALE = 'c43c3b45-b911-498f-baf9-4376dd585588';

function cohortJson(members: { organizationId: string; vehicleId: string }[]) {
  return JSON.stringify({
    version: P25_APD_LTE_R1_COHORT_V1,
    members,
  });
}

describe('APD shadow cohort config', () => {
  const baseEnv = { WORKER_APD_SHADOW_ENABLED: 'false' };

  afterEach(() => {
    delete process.env.WORKER_APD_SHADOW_ENABLED;
    delete process.env[WORKER_APD_SHADOW_COHORT_JSON_ENV];
  });

  it('1 flag OFF + no cohort → DISABLED', () => {
    const r = parseApdShadowCohortRuntime({ ...baseEnv });
    expect(r.state).toBe('DISABLED');
  });

  it('2 flag OFF + valid cohort → DISABLED', () => {
    const r = parseApdShadowCohortRuntime({
      ...baseEnv,
      [WORKER_APD_SHADOW_COHORT_JSON_ENV]: cohortJson([
        { organizationId: ORG, vehicleId: V1 },
      ]),
    });
    expect(r.state).toBe('DISABLED');
  });

  it('3 flag ON + missing cohort → MISSING', () => {
    const r = parseApdShadowCohortRuntime({ WORKER_APD_SHADOW_ENABLED: 'true' });
    expect(r.state).toBe('MISSING');
  });

  it('4 flag ON + malformed JSON → INVALID', () => {
    const r = parseApdShadowCohortRuntime({
      WORKER_APD_SHADOW_ENABLED: 'true',
      [WORKER_APD_SHADOW_COHORT_JSON_ENV]: '{not-json',
    });
    expect(r.state).toBe('INVALID');
  });

  it('5 flag ON + unsupported version → UNSUPPORTED_VERSION', () => {
    const r = parseApdShadowCohortRuntime({
      WORKER_APD_SHADOW_ENABLED: 'true',
      [WORKER_APD_SHADOW_COHORT_JSON_ENV]: JSON.stringify({
        version: 'OTHER',
        members: [{ organizationId: ORG, vehicleId: V1 }],
      }),
    });
    expect(r.state).toBe('UNSUPPORTED_VERSION');
  });

  it('6 flag ON + empty members → EMPTY', () => {
    const r = parseApdShadowCohortRuntime({
      WORKER_APD_SHADOW_ENABLED: 'true',
      [WORKER_APD_SHADOW_COHORT_JSON_ENV]: JSON.stringify({
        version: P25_APD_LTE_R1_COHORT_V1,
        members: [],
      }),
    });
    expect(r.state).toBe('EMPTY');
  });

  it('7 flag ON + duplicate member → INVALID', () => {
    const r = parseApdShadowCohortRuntime({
      WORKER_APD_SHADOW_ENABLED: 'true',
      [WORKER_APD_SHADOW_COHORT_JSON_ENV]: cohortJson([
        { organizationId: ORG, vehicleId: V1 },
        { organizationId: ORG, vehicleId: V1 },
      ]),
    });
    expect(r.state).toBe('INVALID');
  });

  it('8 flag ON + > max members → TOO_LARGE', () => {
    const members = Array.from({ length: APD_SHADOW_COHORT_MAX_MEMBERS + 1 }, (_, i) => ({
      organizationId: ORG,
      vehicleId: `veh-${i}`,
    }));
    const r = parseApdShadowCohortRuntime({
      WORKER_APD_SHADOW_ENABLED: 'true',
      [WORKER_APD_SHADOW_COHORT_JSON_ENV]: cohortJson(members),
    });
    expect(r.state).toBe('TOO_LARGE');
  });

  it('9 exact authorized org+vehicle pair → member', () => {
    const cfg: ApdShadowCohortConfig = {
      version: P25_APD_LTE_R1_COHORT_V1,
      members: [{ organizationId: ORG, vehicleId: V1 }],
    };
    expect(isApdShadowCohortMember(cfg, ORG, V1)).toBe(true);
  });

  it('10 correct vehicle / wrong org → DENY', () => {
    const cfg: ApdShadowCohortConfig = {
      version: P25_APD_LTE_R1_COHORT_V1,
      members: [{ organizationId: ORG, vehicleId: V1 }],
    };
    expect(isApdShadowCohortMember(cfg, 'other-org', V1)).toBe(false);
  });

  it('11 correct org / wrong vehicle → DENY', () => {
    const cfg: ApdShadowCohortConfig = {
      version: P25_APD_LTE_R1_COHORT_V1,
      members: [{ organizationId: ORG, vehicleId: V1 }],
    };
    expect(isApdShadowCohortMember(cfg, ORG, V2)).toBe(false);
  });

  it('12 unknown pair → DENY', () => {
    const cfg: ApdShadowCohortConfig = {
      version: P25_APD_LTE_R1_COHORT_V1,
      members: [{ organizationId: ORG, vehicleId: V1 }],
    };
    expect(isApdShadowCohortMember(cfg, 'x', 'y')).toBe(false);
  });

  it('13 stale former-fleet identity excluded from allowlist', () => {
    const cfg: ApdShadowCohortConfig = {
      version: P25_APD_LTE_R1_COHORT_V1,
      members: [
        { organizationId: ORG, vehicleId: V1 },
        { organizationId: ORG, vehicleId: V2 },
      ],
    };
    expect(isApdShadowCohortMember(cfg, ORG, STALE)).toBe(false);
  });

  it('21 canonical config ordering produces same hash', () => {
    const a: ApdShadowCohortConfig = {
      version: P25_APD_LTE_R1_COHORT_V1,
      members: [
        { organizationId: ORG, vehicleId: V2 },
        { organizationId: ORG, vehicleId: V1 },
      ],
    };
    const b: ApdShadowCohortConfig = {
      version: P25_APD_LTE_R1_COHORT_V1,
      members: [
        { organizationId: ORG, vehicleId: V1 },
        { organizationId: ORG, vehicleId: V2 },
      ],
    };
    expect(computeApdShadowCohortFingerprintSha256(a)).toBe(
      computeApdShadowCohortFingerprintSha256(b),
    );
  });

  it('22 changed member produces different hash', () => {
    const a: ApdShadowCohortConfig = {
      version: P25_APD_LTE_R1_COHORT_V1,
      members: [{ organizationId: ORG, vehicleId: V1 }],
    };
    const b: ApdShadowCohortConfig = {
      version: P25_APD_LTE_R1_COHORT_V1,
      members: [{ organizationId: ORG, vehicleId: V2 }],
    };
    expect(computeApdShadowCohortFingerprintSha256(a)).not.toBe(
      computeApdShadowCohortFingerprintSha256(b),
    );
  });

  it('20 tenant-safe memory keys do not collide on vehicleId alone', () => {
    const k1 = buildApdShadowTenantMemoryKey('org-a', 'same-veh');
    const k2 = buildApdShadowTenantMemoryKey('org-b', 'same-veh');
    expect(k1).not.toBe(k2);
  });
});

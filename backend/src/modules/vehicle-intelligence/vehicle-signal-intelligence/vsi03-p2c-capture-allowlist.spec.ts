import {
  buildVsi03P2cCapturePilotAllowlistJson,
  evaluateVsi03P2cCaptureAdmission,
  parseVsi03P2cCapturePilotAllowlist,
} from './vsi03-p2c-capture-allowlist';
import {
  VSI03_P2C_CAPTURE_PILOT_ALLOWLIST_ENABLED_ENV,
  VSI03_P2C_CAPTURE_PILOT_ALLOWLIST_JSON_ENV,
  VSI03_P2C_SOURCE_OBSERVATION_CAPTURE_ENV,
} from './vsi03-p2c.config';

const ORG = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const VEH = '19fedd4b-c4e8-4de8-a125-dab293326e7e';
const OTHER_VEH = 'c10351f8-b6a2-4258-947f-631aeaa6d359';

describe('vsi03-p2c capture allowlist', () => {
  afterEach(() => {
    delete process.env[VSI03_P2C_SOURCE_OBSERVATION_CAPTURE_ENV];
    delete process.env[VSI03_P2C_CAPTURE_PILOT_ALLOWLIST_ENABLED_ENV];
    delete process.env[VSI03_P2C_CAPTURE_PILOT_ALLOWLIST_JSON_ENV];
  });

  it('fails closed when capture flag is off', () => {
    process.env[VSI03_P2C_CAPTURE_PILOT_ALLOWLIST_ENABLED_ENV] = 'true';
    process.env[VSI03_P2C_CAPTURE_PILOT_ALLOWLIST_JSON_ENV] = buildVsi03P2cCapturePilotAllowlistJson([
      { organizationId: ORG, vehicleId: VEH },
    ]);
    expect(
      evaluateVsi03P2cCaptureAdmission({ organizationId: ORG, vehicleId: VEH }).admitted,
    ).toBe(false);
  });

  it('fails closed when allowlist is not enabled', () => {
    process.env[VSI03_P2C_SOURCE_OBSERVATION_CAPTURE_ENV] = 'true';
    process.env[VSI03_P2C_CAPTURE_PILOT_ALLOWLIST_JSON_ENV] = buildVsi03P2cCapturePilotAllowlistJson([
      { organizationId: ORG, vehicleId: VEH },
    ]);
    const admission = evaluateVsi03P2cCaptureAdmission({ organizationId: ORG, vehicleId: VEH });
    expect(admission.admitted).toBe(false);
    if (!admission.admitted) expect(admission.reason).toBe('ALLOWLIST_NOT_ENABLED');
  });

  it('fails closed on malformed JSON', () => {
    process.env[VSI03_P2C_SOURCE_OBSERVATION_CAPTURE_ENV] = 'true';
    process.env[VSI03_P2C_CAPTURE_PILOT_ALLOWLIST_ENABLED_ENV] = 'true';
    process.env[VSI03_P2C_CAPTURE_PILOT_ALLOWLIST_JSON_ENV] = '{not-json';
    expect(parseVsi03P2cCapturePilotAllowlist().ok).toBe(false);
    const malformed = evaluateVsi03P2cCaptureAdmission({ organizationId: ORG, vehicleId: VEH });
    expect(malformed.admitted).toBe(false);
    if (!malformed.admitted) expect(malformed.reason).toBe('ALLOWLIST_MALFORMED');
  });

  it('fails closed on empty entries', () => {
    process.env[VSI03_P2C_SOURCE_OBSERVATION_CAPTURE_ENV] = 'true';
    process.env[VSI03_P2C_CAPTURE_PILOT_ALLOWLIST_ENABLED_ENV] = 'true';
    process.env[VSI03_P2C_CAPTURE_PILOT_ALLOWLIST_JSON_ENV] = JSON.stringify({
      version: 1,
      entries: [],
    });
    const empty = evaluateVsi03P2cCaptureAdmission({ organizationId: ORG, vehicleId: VEH });
    expect(empty.admitted).toBe(false);
    if (!empty.admitted) expect(empty.reason).toBe('ALLOWLIST_MALFORMED');
  });

  it('admits only allowlisted org+vehicle pairs', () => {
    process.env[VSI03_P2C_SOURCE_OBSERVATION_CAPTURE_ENV] = 'true';
    process.env[VSI03_P2C_CAPTURE_PILOT_ALLOWLIST_ENABLED_ENV] = 'true';
    process.env[VSI03_P2C_CAPTURE_PILOT_ALLOWLIST_JSON_ENV] = buildVsi03P2cCapturePilotAllowlistJson([
      { organizationId: ORG, vehicleId: VEH },
    ]);
    expect(
      evaluateVsi03P2cCaptureAdmission({ organizationId: ORG, vehicleId: VEH }).admitted,
    ).toBe(true);
    const excluded = evaluateVsi03P2cCaptureAdmission({
      organizationId: ORG,
      vehicleId: OTHER_VEH,
    });
    expect(excluded.admitted).toBe(false);
    if (!excluded.admitted) expect(excluded.reason).toBe('NOT_IN_ALLOWLIST');
  });

  it('isolates tenants — wrong organization is denied', () => {
    process.env[VSI03_P2C_SOURCE_OBSERVATION_CAPTURE_ENV] = 'true';
    process.env[VSI03_P2C_CAPTURE_PILOT_ALLOWLIST_ENABLED_ENV] = 'true';
    process.env[VSI03_P2C_CAPTURE_PILOT_ALLOWLIST_JSON_ENV] = buildVsi03P2cCapturePilotAllowlistJson([
      { organizationId: ORG, vehicleId: VEH },
    ]);
    const wrongOrg = evaluateVsi03P2cCaptureAdmission({
      organizationId: '00000000-0000-4000-8000-000000000001',
      vehicleId: VEH,
    });
    expect(wrongOrg.admitted).toBe(false);
    if (!wrongOrg.admitted) expect(wrongOrg.reason).toBe('NOT_IN_ALLOWLIST');
  });
});

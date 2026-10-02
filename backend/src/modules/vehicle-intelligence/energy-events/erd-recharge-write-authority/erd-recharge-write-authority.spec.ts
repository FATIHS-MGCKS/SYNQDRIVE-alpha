import {
  ERD_RECHARGE_EPISODE_WRITE_OWNER,
  ERD_RECHARGE_WRITE_AUTHORITY,
  ERD_RECHARGE_WRITE_AUTHORITY_REASON,
} from './erd-recharge-write-authority.constants';
import { evaluateErdRechargeWriteAuthority, evaluateRechargeEpisodeWriteOwner } from './erd-recharge-write-authority.policy';
import {
  evaluateLegacyRechargeWriteGate,
  shouldProjectCanonicalRechargeSession,
} from './erd-recharge-write-gate.policy';
import type { CoalescedEnergySegment } from '../energy-events.pipeline';

const CUTOVER = '2026-09-01T12:00:00.000Z';

function saveBatteryEnv(): Record<string, string | undefined> {
  return {
    BATTERY_V2_HV_RECHARGE_SESSION_ENABLED: process.env.BATTERY_V2_HV_RECHARGE_SESSION_ENABLED,
    BATTERY_V2_HV_FALLBACK_CHARGE_SESSION_ENABLED:
      process.env.BATTERY_V2_HV_FALLBACK_CHARGE_SESSION_ENABLED,
    BATTERY_V2_RECONCILIATION_ENABLED: process.env.BATTERY_V2_RECONCILIATION_ENABLED,
  };
}

function restoreBatteryEnv(snapshot: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function enableBatteryPrerequisites() {
  process.env.BATTERY_V2_HV_RECHARGE_SESSION_ENABLED = 'true';
  process.env.BATTERY_V2_HV_FALLBACK_CHARGE_SESSION_ENABLED = 'true';
  process.env.BATTERY_V2_RECONCILIATION_ENABLED = 'true';
}

function rechargeSegment(endIso: string): CoalescedEnergySegment {
  return {
    mechanism: 'recharge',
    coalescedSegmentId: 'dimo-seg-1',
    startTime: '2026-08-01T10:00:00.000Z',
    endTime: endIso,
    subsegmentIds: ['dimo-seg-1'],
    segments: [],
  } as unknown as CoalescedEnergySegment;
}

describe('erd-recharge-write-authority (E5.6)', () => {
  let batterySnapshot: Record<string, string | undefined>;

  beforeEach(() => {
    batterySnapshot = saveBatteryEnv();
  });

  afterEach(() => {
    restoreBatteryEnv(batterySnapshot);
  });

  describe('config matrix C1–C12', () => {
    it('C1: authorization unset → LEGACY', () => {
      const r = evaluateErdRechargeWriteAuthority({});
      expect(r.authority).toBe(ERD_RECHARGE_WRITE_AUTHORITY.LEGACY);
      expect(r.reason).toBe(ERD_RECHARGE_WRITE_AUTHORITY_REASON.CUTOVER_NOT_AUTHORIZED);
    });

    it('C2: authorization false → LEGACY', () => {
      const r = evaluateErdRechargeWriteAuthority({
        ERD_RECHARGE_WRITE_CUTOVER_AUTHORIZED: 'false',
      });
      expect(r.authority).toBe(ERD_RECHARGE_WRITE_AUTHORITY.LEGACY);
    });

    it('C3: authorization malformed → LEGACY', () => {
      for (const bad of ['1', 'yes', 'on', 'TRUE-ish']) {
        const r = evaluateErdRechargeWriteAuthority({
          ERD_RECHARGE_WRITE_CUTOVER_AUTHORIZED: bad,
          ERD_RECHARGE_WRITE_CUTOVER_AT: CUTOVER,
        });
        expect(r.authority).toBe(ERD_RECHARGE_WRITE_AUTHORITY.LEGACY);
      }
    });

    it('C4: authorized + cutover missing → LEGACY', () => {
      enableBatteryPrerequisites();
      const r = evaluateErdRechargeWriteAuthority({
        ERD_RECHARGE_WRITE_CUTOVER_AUTHORIZED: 'true',
        ERD_RECHARGE_PRODUCT_READ_DEDUPE_ENABLED: '1',
      });
      expect(r.reason).toBe(ERD_RECHARGE_WRITE_AUTHORITY_REASON.CUTOVER_AT_MISSING);
    });

    it('C5: authorized + invalid cutover → LEGACY', () => {
      enableBatteryPrerequisites();
      const r = evaluateErdRechargeWriteAuthority({
        ERD_RECHARGE_WRITE_CUTOVER_AUTHORIZED: 'true',
        ERD_RECHARGE_WRITE_CUTOVER_AT: 'not-a-date',
        ERD_RECHARGE_PRODUCT_READ_DEDUPE_ENABLED: '1',
      });
      expect(r.reason).toBe(ERD_RECHARGE_WRITE_AUTHORITY_REASON.CUTOVER_AT_INVALID);
    });

    it('C6: HV session runtime OFF → LEGACY', () => {
      enableBatteryPrerequisites();
      process.env.BATTERY_V2_HV_RECHARGE_SESSION_ENABLED = 'false';
      const r = evaluateErdRechargeWriteAuthority({
        ERD_RECHARGE_WRITE_CUTOVER_AUTHORIZED: 'true',
        ERD_RECHARGE_WRITE_CUTOVER_AT: CUTOVER,
        ERD_RECHARGE_PRODUCT_READ_DEDUPE_ENABLED: '1',
      });
      expect(r.reason).toBe(
        ERD_RECHARGE_WRITE_AUTHORITY_REASON.CANONICAL_SESSION_RUNTIME_DISABLED,
      );
    });

    it('C7: fallback runtime OFF → LEGACY', () => {
      enableBatteryPrerequisites();
      process.env.BATTERY_V2_HV_FALLBACK_CHARGE_SESSION_ENABLED = 'false';
      const r = evaluateErdRechargeWriteAuthority({
        ERD_RECHARGE_WRITE_CUTOVER_AUTHORIZED: 'true',
        ERD_RECHARGE_WRITE_CUTOVER_AT: CUTOVER,
        ERD_RECHARGE_PRODUCT_READ_DEDUPE_ENABLED: '1',
      });
      expect(r.reason).toBe(
        ERD_RECHARGE_WRITE_AUTHORITY_REASON.FALLBACK_SESSION_RUNTIME_DISABLED,
      );
    });

    it('C8: reconciliation OFF → LEGACY', () => {
      enableBatteryPrerequisites();
      process.env.BATTERY_V2_RECONCILIATION_ENABLED = 'false';
      const r = evaluateErdRechargeWriteAuthority({
        ERD_RECHARGE_WRITE_CUTOVER_AUTHORIZED: 'true',
        ERD_RECHARGE_WRITE_CUTOVER_AT: CUTOVER,
        ERD_RECHARGE_PRODUCT_READ_DEDUPE_ENABLED: '1',
      });
      expect(r.reason).toBe(ERD_RECHARGE_WRITE_AUTHORITY_REASON.RECONCILIATION_RUNTIME_DISABLED);
    });

    it('C9: read dedupe OFF → LEGACY', () => {
      enableBatteryPrerequisites();
      const r = evaluateErdRechargeWriteAuthority({
        ERD_RECHARGE_WRITE_CUTOVER_AUTHORIZED: 'true',
        ERD_RECHARGE_WRITE_CUTOVER_AT: CUTOVER,
        ERD_RECHARGE_PRODUCT_READ_DEDUPE_ENABLED: '0',
      });
      expect(r.reason).toBe(ERD_RECHARGE_WRITE_AUTHORITY_REASON.PRODUCT_READ_DEDUPE_DISABLED);
    });

    it('C10: all prerequisites → CANONICAL', () => {
      enableBatteryPrerequisites();
      const r = evaluateErdRechargeWriteAuthority({
        ERD_RECHARGE_WRITE_CUTOVER_AUTHORIZED: 'true',
        ERD_RECHARGE_WRITE_CUTOVER_AT: CUTOVER,
        ERD_RECHARGE_PRODUCT_READ_DEDUPE_ENABLED: '1',
      });
      expect(r.authority).toBe(ERD_RECHARGE_WRITE_AUTHORITY.CANONICAL);
      expect(r.reason).toBe(ERD_RECHARGE_WRITE_AUTHORITY_REASON.CANONICAL_AUTHORITY_READY);
    });

    it('C11/C12: shadow parity does not affect authority', () => {
      enableBatteryPrerequisites();
      const base = {
        ERD_RECHARGE_WRITE_CUTOVER_AUTHORIZED: 'true',
        ERD_RECHARGE_WRITE_CUTOVER_AT: CUTOVER,
        ERD_RECHARGE_PRODUCT_READ_DEDUPE_ENABLED: '1',
      };
      const off = evaluateErdRechargeWriteAuthority({
        ...base,
        ERD_RECHARGE_SHADOW_PARITY_ENABLED: '0',
      });
      const on = evaluateErdRechargeWriteAuthority({
        ...base,
        ERD_RECHARGE_SHADOW_PARITY_ENABLED: '1',
      });
      expect(off.authority).toBe(ERD_RECHARGE_WRITE_AUTHORITY.CANONICAL);
      expect(on.authority).toBe(off.authority);
    });
  });

  describe('ownership boundary W1–W9', () => {
    const globalCanonical = () =>
      evaluateErdRechargeWriteAuthority({
        ERD_RECHARGE_WRITE_CUTOVER_AUTHORIZED: 'true',
        ERD_RECHARGE_WRITE_CUTOVER_AT: CUTOVER,
        ERD_RECHARGE_PRODUCT_READ_DEDUPE_ENABLED: '1',
      });

    beforeEach(() => enableBatteryPrerequisites());

    it('W1 legacy end before cutover → legacy persists', () => {
      const gate = evaluateLegacyRechargeWriteGate({
        segment: rechargeSegment('2026-08-31T12:00:00.000Z'),
        existing: null,
        env: {
          ERD_RECHARGE_WRITE_CUTOVER_AUTHORIZED: 'true',
          ERD_RECHARGE_WRITE_CUTOVER_AT: CUTOVER,
          ERD_RECHARGE_PRODUCT_READ_DEDUPE_ENABLED: '1',
        },
      });
      expect(gate.allowPersist).toBe(true);
    });

    it('W2/W3 legacy end >= cutover → suppressed', () => {
      for (const end of ['2026-09-01T12:00:00.000Z', '2026-09-02T00:00:00.000Z']) {
        const gate = evaluateLegacyRechargeWriteGate({
          segment: rechargeSegment(end),
          existing: null,
          env: {
            ERD_RECHARGE_WRITE_CUTOVER_AUTHORIZED: 'true',
            ERD_RECHARGE_WRITE_CUTOVER_AT: CUTOVER,
            ERD_RECHARGE_PRODUCT_READ_DEDUPE_ENABLED: '1',
          },
        });
        expect(gate.allowPersist).toBe(false);
      }
    });

    it('W4–W6 canonical session boundary', () => {
      const env = {
        ERD_RECHARGE_WRITE_CUTOVER_AUTHORIZED: 'true',
        ERD_RECHARGE_WRITE_CUTOVER_AT: CUTOVER,
        ERD_RECHARGE_PRODUCT_READ_DEDUPE_ENABLED: '1',
      };
      expect(
        shouldProjectCanonicalRechargeSession({
          session: {
            startAt: new Date('2026-08-01T10:00:00.000Z'),
            endAt: new Date('2026-08-31T12:00:00.000Z'),
            isOngoing: false,
          },
          env,
        }).allowed,
      ).toBe(false);
      for (const end of ['2026-09-01T12:00:00.000Z', '2026-09-02T00:00:00.000Z']) {
        expect(
          shouldProjectCanonicalRechargeSession({
            session: {
              startAt: new Date('2026-09-01T10:00:00.000Z'),
              endAt: new Date(end),
              isOngoing: false,
            },
            env,
          }).allowed,
        ).toBe(true);
      }
    });

    it('W7/W8/W9: physical end governs episode owner', () => {
      const global = globalCanonical();
      const preCutoverPhysical = evaluateRechargeEpisodeWriteOwner({
        physicalEvidenceEnd: new Date('2026-08-15T00:00:00.000Z'),
        globalAuthority: global,
      });
      expect(preCutoverPhysical.owner).toBe(ERD_RECHARGE_EPISODE_WRITE_OWNER.LEGACY);
    });
  });
});

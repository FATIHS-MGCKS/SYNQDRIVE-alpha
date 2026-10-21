import {
  ERD_RECHARGE_SHADOW_PARITY_CANARY_ALLOWLIST_ENV,
  ERD_RECHARGE_SHADOW_PARITY_ENV_FLAG,
} from './erd-recharge-shadow-parity.constants';
import {
  parseErdRechargeShadowCanaryAllowlist,
  resolveErdRechargeShadowRuntimeAuthorization,
} from './erd-recharge-shadow-runtime-scope.policy';

const ORG_A = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const VEH_X = '68868291-5478-42cd-b0c4-cc77b2a78e21';
const ORG_B = '11111111-1111-4111-8111-111111111111';
const VEH_Y = '22222222-2222-4222-8222-222222222222';

function env(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { ...process.env, ...overrides };
}

describe('erd-recharge-shadow-runtime-scope.policy', () => {
  describe('parseErdRechargeShadowCanaryAllowlist', () => {
    it('returns empty valid set for absent/empty allowlist', () => {
      expect(parseErdRechargeShadowCanaryAllowlist(undefined).pairs.size).toBe(0);
      expect(parseErdRechargeShadowCanaryAllowlist('   ').valid).toBe(true);
    });
  });

  describe('resolveErdRechargeShadowRuntimeAuthorization matrix C1–C16', () => {
    it('C1: global=false, allowlist absent → DISABLED', () => {
      const out = resolveErdRechargeShadowRuntimeAuthorization({
        organizationId: ORG_A,
        vehicleId: VEH_X,
        env: env({
          [ERD_RECHARGE_SHADOW_PARITY_ENV_FLAG]: undefined,
          [ERD_RECHARGE_SHADOW_PARITY_CANARY_ALLOWLIST_ENV]: undefined,
        }),
      });
      expect(out).toEqual({ authorized: false, mode: 'DISABLED', scopedEntryCount: 0 });
    });

    it('C2: global=false, allowlist empty → DISABLED', () => {
      const out = resolveErdRechargeShadowRuntimeAuthorization({
        organizationId: ORG_A,
        vehicleId: VEH_X,
        env: env({
          [ERD_RECHARGE_SHADOW_PARITY_ENV_FLAG]: 'false',
          [ERD_RECHARGE_SHADOW_PARITY_CANARY_ALLOWLIST_ENV]: '',
        }),
      });
      expect(out.mode).toBe('DISABLED');
      expect(out.authorized).toBe(false);
    });

    it('C3: global=false, exact single pair → SCOPED_CANARY authorized', () => {
      const out = resolveErdRechargeShadowRuntimeAuthorization({
        organizationId: ORG_A,
        vehicleId: VEH_X,
        env: env({
          [ERD_RECHARGE_SHADOW_PARITY_ENV_FLAG]: undefined,
          [ERD_RECHARGE_SHADOW_PARITY_CANARY_ALLOWLIST_ENV]: `${ORG_A}:${VEH_X}`,
        }),
      });
      expect(out).toEqual({
        authorized: true,
        mode: 'SCOPED_CANARY',
        scopedEntryCount: 1,
      });
    });

    it('C4: global=false, same org wrong vehicle → DISABLED', () => {
      const out = resolveErdRechargeShadowRuntimeAuthorization({
        organizationId: ORG_A,
        vehicleId: VEH_Y,
        env: env({
          [ERD_RECHARGE_SHADOW_PARITY_CANARY_ALLOWLIST_ENV]: `${ORG_A}:${VEH_X}`,
        }),
      });
      expect(out.authorized).toBe(false);
      expect(out.mode).toBe('DISABLED');
    });

    it('C5: global=false, wrong org same vehicle → DISABLED', () => {
      const out = resolveErdRechargeShadowRuntimeAuthorization({
        organizationId: ORG_B,
        vehicleId: VEH_X,
        env: env({
          [ERD_RECHARGE_SHADOW_PARITY_CANARY_ALLOWLIST_ENV]: `${ORG_A}:${VEH_X}`,
        }),
      });
      expect(out.authorized).toBe(false);
      expect(out.mode).toBe('DISABLED');
    });

    it('C6: global=false, multiple valid pairs → exact match authorized', () => {
      const allowlist = `${ORG_A}:${VEH_X},${ORG_B}:${VEH_Y}`;
      expect(
        resolveErdRechargeShadowRuntimeAuthorization({
          organizationId: ORG_B,
          vehicleId: VEH_Y,
          env: env({ [ERD_RECHARGE_SHADOW_PARITY_CANARY_ALLOWLIST_ENV]: allowlist }),
        }).authorized,
      ).toBe(true);
      expect(
        resolveErdRechargeShadowRuntimeAuthorization({
          organizationId: ORG_A,
          vehicleId: VEH_Y,
          env: env({ [ERD_RECHARGE_SHADOW_PARITY_CANARY_ALLOWLIST_ENV]: allowlist }),
        }).authorized,
      ).toBe(false);
    });

    it('C7: duplicate entries dedupe to one scoped pair', () => {
      const parsed = parseErdRechargeShadowCanaryAllowlist(`${ORG_A}:${VEH_X},${ORG_A}:${VEH_X}`);
      expect(parsed.valid).toBe(true);
      expect(parsed.pairs.size).toBe(1);
    });

    it('C8: whitespace around entries is trimmed', () => {
      const out = resolveErdRechargeShadowRuntimeAuthorization({
        organizationId: ORG_A,
        vehicleId: VEH_X,
        env: env({
          [ERD_RECHARGE_SHADOW_PARITY_CANARY_ALLOWLIST_ENV]: `  ${ORG_A} : ${VEH_X}  `,
        }),
      });
      expect(out.mode).toBe('SCOPED_CANARY');
      expect(out.authorized).toBe(true);
    });

    it('C9: trailing comma → INVALID_SCOPED_CONFIG', () => {
      const out = resolveErdRechargeShadowRuntimeAuthorization({
        organizationId: ORG_A,
        vehicleId: VEH_X,
        env: env({
          [ERD_RECHARGE_SHADOW_PARITY_CANARY_ALLOWLIST_ENV]: `${ORG_A}:${VEH_X},`,
        }),
      });
      expect(out.mode).toBe('INVALID_SCOPED_CONFIG');
      expect(out.authorized).toBe(false);
    });

    it('C10: missing colon → INVALID_SCOPED_CONFIG', () => {
      const out = resolveErdRechargeShadowRuntimeAuthorization({
        organizationId: ORG_A,
        vehicleId: VEH_X,
        env: env({ [ERD_RECHARGE_SHADOW_PARITY_CANARY_ALLOWLIST_ENV]: ORG_A }),
      });
      expect(out.mode).toBe('INVALID_SCOPED_CONFIG');
    });

    it('C11: multiple colons → INVALID_SCOPED_CONFIG', () => {
      const out = resolveErdRechargeShadowRuntimeAuthorization({
        organizationId: ORG_A,
        vehicleId: VEH_X,
        env: env({
          [ERD_RECHARGE_SHADOW_PARITY_CANARY_ALLOWLIST_ENV]: `${ORG_A}:${VEH_X}:extra`,
        }),
      });
      expect(out.mode).toBe('INVALID_SCOPED_CONFIG');
    });

    it('C12: wildcard → INVALID_SCOPED_CONFIG', () => {
      for (const bad of ['*:*', `${ORG_A}:*`, `*:${VEH_X}`, '*']) {
        const out = resolveErdRechargeShadowRuntimeAuthorization({
          organizationId: ORG_A,
          vehicleId: VEH_X,
          env: env({ [ERD_RECHARGE_SHADOW_PARITY_CANARY_ALLOWLIST_ENV]: bad }),
        });
        expect(out.mode).toBe('INVALID_SCOPED_CONFIG');
        expect(out.authorized).toBe(false);
      }
    });

    it('C13: one valid + one malformed → INVALID, valid subset not authorized', () => {
      const out = resolveErdRechargeShadowRuntimeAuthorization({
        organizationId: ORG_A,
        vehicleId: VEH_X,
        env: env({
          [ERD_RECHARGE_SHADOW_PARITY_CANARY_ALLOWLIST_ENV]: `${ORG_A}:${VEH_X},badtoken`,
        }),
      });
      expect(out.mode).toBe('INVALID_SCOPED_CONFIG');
      expect(out.authorized).toBe(false);
    });

    it('C14: global=true, no allowlist → GLOBAL', () => {
      const out = resolveErdRechargeShadowRuntimeAuthorization({
        organizationId: ORG_A,
        vehicleId: VEH_X,
        env: env({
          [ERD_RECHARGE_SHADOW_PARITY_ENV_FLAG]: 'true',
          [ERD_RECHARGE_SHADOW_PARITY_CANARY_ALLOWLIST_ENV]: undefined,
        }),
      });
      expect(out).toEqual({ authorized: true, mode: 'GLOBAL', scopedEntryCount: 0 });
    });

    it('C15: global=true + valid allowlist → GLOBAL', () => {
      const out = resolveErdRechargeShadowRuntimeAuthorization({
        organizationId: ORG_A,
        vehicleId: VEH_X,
        env: env({
          [ERD_RECHARGE_SHADOW_PARITY_ENV_FLAG]: '1',
          [ERD_RECHARGE_SHADOW_PARITY_CANARY_ALLOWLIST_ENV]: `${ORG_B}:${VEH_Y}`,
        }),
      });
      expect(out.mode).toBe('GLOBAL');
      expect(out.authorized).toBe(true);
      expect(out.scopedEntryCount).toBe(1);
    });

    it('C16: global=true + malformed allowlist → GLOBAL', () => {
      const out = resolveErdRechargeShadowRuntimeAuthorization({
        organizationId: ORG_A,
        vehicleId: VEH_X,
        env: env({
          [ERD_RECHARGE_SHADOW_PARITY_ENV_FLAG]: 'true',
          [ERD_RECHARGE_SHADOW_PARITY_CANARY_ALLOWLIST_ENV]: 'bad,',
        }),
      });
      expect(out.mode).toBe('GLOBAL');
      expect(out.authorized).toBe(true);
      expect(out.scopedEntryCount).toBe(0);
    });
  });

  it('allowlist order invariant: comma order does not change authorization', () => {
    const a = `${ORG_A}:${VEH_X},${ORG_B}:${VEH_Y}`;
    const b = `${ORG_B}:${VEH_Y},${ORG_A}:${VEH_X}`;
    const envBase = { [ERD_RECHARGE_SHADOW_PARITY_ENV_FLAG]: undefined };
    expect(
      resolveErdRechargeShadowRuntimeAuthorization({
        organizationId: ORG_A,
        vehicleId: VEH_X,
        env: env({ ...envBase, [ERD_RECHARGE_SHADOW_PARITY_CANARY_ALLOWLIST_ENV]: a }),
      }).authorized,
    ).toBe(
      resolveErdRechargeShadowRuntimeAuthorization({
        organizationId: ORG_A,
        vehicleId: VEH_X,
        env: env({ ...envBase, [ERD_RECHARGE_SHADOW_PARITY_CANARY_ALLOWLIST_ENV]: b }),
      }).authorized,
    );
  });
});

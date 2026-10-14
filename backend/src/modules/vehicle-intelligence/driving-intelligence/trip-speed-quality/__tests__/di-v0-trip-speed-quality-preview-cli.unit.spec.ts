import { randomUUID } from 'crypto';
import {
  DiV0P21PreviewScopeError,
  exitCodeForPreviewOutcome,
  resolveDiV0P21PreviewScope,
} from '../di-v0-trip-speed-quality-preview-cli.scope';

const ORG = randomUUID();
const TRIP = randomUUID();
const WI = randomUUID();

describe('P2.1 preview CLI scope validation', () => {
  it('accepts full CLI flag triple', () => {
    const scope = resolveDiV0P21PreviewScope(
      ['node', 'script', '--organizationId', ORG, '--tripId', TRIP, '--workItemId', WI],
      {},
    );
    expect(scope.source).toBe('cli_flags');
    expect(scope.organizationId).toBe(ORG);
  });

  it('accepts full DI_V0_P21 env bundle', () => {
    const scope = resolveDiV0P21PreviewScope([], {
      DI_V0_P21_ORGANIZATION_ID: ORG,
      DI_V0_P21_TRIP_ID: TRIP,
      DI_V0_P21_WORK_ITEM_ID: WI,
    });
    expect(scope.source).toBe('p21_env_bundle');
  });

  it('rejects mixed CLI and env', () => {
    expect(() =>
      resolveDiV0P21PreviewScope(['--organizationId', ORG], {
        DI_V0_P21_TRIP_ID: TRIP,
        DI_V0_P21_WORK_ITEM_ID: WI,
      }),
    ).toThrow(DiV0P21PreviewScopeError);
  });

  it('rejects partial CLI flags', () => {
    expect(() => resolveDiV0P21PreviewScope(['--organizationId', ORG, '--tripId', TRIP], {})).toThrow(
      DiV0P21PreviewScopeError,
    );
  });

  it('rejects invalid UUID', () => {
    try {
      resolveDiV0P21PreviewScope(
        ['--organizationId', 'not-a-uuid', '--tripId', TRIP, '--workItemId', WI],
        {},
      );
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(DiV0P21PreviewScopeError);
      expect((e as DiV0P21PreviewScopeError).code).toBe('INVALID_UUID');
    }
  });

  it('rejects standalone ORGANIZATION_ID env without P21 bundle', () => {
    expect(() => resolveDiV0P21PreviewScope([], { ORGANIZATION_ID: ORG })).toThrow(DiV0P21PreviewScopeError);
  });

  it('maps preview outcomes to exit codes', () => {
    expect(exitCodeForPreviewOutcome('ASSESSED')).toBe(0);
    expect(exitCodeForPreviewOutcome('NOT_ASSESSABLE')).toBe(3);
  });
});

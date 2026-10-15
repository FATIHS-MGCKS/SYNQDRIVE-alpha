import type { DiV0P2AutoProjectionV2Config } from './di-v0-p2-auto-projection-v2.config';

export const DI_V0_P2_AUTO_PROJECTION_V2_CONFIG = Symbol('DI_V0_P2_AUTO_PROJECTION_V2_CONFIG');

export interface DiV0P2AutoProjectionV2Bootstrap {
  config: DiV0P2AutoProjectionV2Config;
  /** When set, auto projection is force-disabled (invalid env) without failing Nest bootstrap. */
  disabledReason: string | null;
}

export const DI_V0_P2_AUTO_PROJECTION_V2_BOOTSTRAP = Symbol('DI_V0_P2_AUTO_PROJECTION_V2_BOOTSTRAP');

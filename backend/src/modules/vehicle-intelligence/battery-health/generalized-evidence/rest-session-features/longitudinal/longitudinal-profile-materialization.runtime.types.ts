import type { LongitudinalProfileMaterializationOutcome } from './longitudinal-profile-materialization.types';

export type LongitudinalProfileMaterializationRuntimeOutcome =
  | { status: 'SKIPPED_FLAG_OFF' }
  | LongitudinalProfileMaterializationOutcome;

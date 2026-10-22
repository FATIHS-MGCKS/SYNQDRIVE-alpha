import { EXP021_FROZEN_M7A_RESEARCH_SHA } from './exp021-frozen-m7a.manifest';

export { EXP021_FROZEN_M7A_RESEARCH_SHA };

/**
 * Paths whose runtime behavior affects M7A decode or trip processing.
 * Each must match EXP021_FROZEN_M7A_RESEARCH_SHA (git diff must be empty).
 */
export const EXP021_FROZEN_M7A_USED_DEPENDENCY_PATHS = [
  'backend/src/modules/vehicle-intelligence/driving-intelligence/s4-research',
  'backend/src/modules/vehicle-intelligence/driving-intelligence/s4-research-worker/di-v0-s4-research-osm-context.ts',
  'backend/src/modules/vehicle-intelligence/driving-intelligence/s4-research-worker/di-v0-s4-research-snapshot-adapter.ts',
  'backend/src/modules/vehicle-intelligence/driving-intelligence/s4-research-worker/di-v0-s4-research-shadow-evidence.ts',
  'backend/src/modules/vehicle-intelligence/driving-intelligence/s4-research-worker/di-v0-s4-research-processor.ts',
  'backend/src/modules/vehicle-intelligence/driving-intelligence/s4d-replay/di-v0-s4d-verified-snapshot.ts',
] as const;

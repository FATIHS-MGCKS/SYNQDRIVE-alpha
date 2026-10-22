/** Pinned EXP021 Phase 5A freeze metadata (see architecture evidence FREEZE_MANIFEST.json). */
export const EXP021_FROZEN_M7A_RESEARCH_SHA = '477ecad737294efbf18472cf8d903d447ca1e397';

export const EXP021_FROZEN_M7A_HARNESS_MODEL_ID = 'M7A';

export const EXP021_FROZEN_M7A_PHASE3_LIB_SNAPSHOT_SHA256 =
  'd147dcb48852d886b15a150f68c19fcedf8583734264bc962cc0df1b91000316';

/** Git tree archive at research freeze SHA 477ecad… (historical; may differ from main). */
export const EXP021_FROZEN_M7A_S4_RESEARCH_TREE_SHA256_FREEZE =
  '55080af81f6fd2f61b011a62df01404d3a86149e6c8fbf3d4f4d7669458da074';

/** Sorted `.ts` source hash of `s4-research/` on integration main (drift gate for this PR). */
export const EXP021_FROZEN_M7A_S4_RESEARCH_TREE_SHA256_INTEGRATION =
  '74863d2f3b7e4d95777697fcc27984ffe4904c8726e62e0432df38a6ddd74af7';

/** Tiguan development-set per-bucket assignment hash (freeze reproducibility.json). */
export const EXP021_FROZEN_M7A_TIGUAN_PER_BUCKET_SHA256 =
  '4201e931ac47734e4a68aa11e8735b264aee6d9e9055f1b6e6c3f94b37acf74f';

export const EXP021_FROZEN_M7A_HEADING_GUARD = {
  minDisplacementM: 1.5,
  minSpeedKmh: 5,
} as const;

export const EXP021_FROZEN_M7A_DECODER_OPTS = {
  nullMemory: true,
  standstillGuardM: 2,
  confidenceKind: 'GAP' as const,
  competitorGapM: 5,
};

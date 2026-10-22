/** Pinned EXP021 Phase 5A freeze metadata (see architecture evidence FREEZE_MANIFEST.json). */
export const EXP021_FROZEN_M7A_RESEARCH_SHA = '477ecad737294efbf18472cf8d903d447ca1e397';

export const EXP021_FROZEN_M7A_HARNESS_MODEL_ID = 'M7A';

export const EXP021_FROZEN_M7A_PHASE3_LIB_SNAPSHOT_SHA256 =
  'd147dcb48852d886b15a150f68c19fcedf8583734264bc962cc0df1b91000316';

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

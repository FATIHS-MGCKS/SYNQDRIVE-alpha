/** V1 EV charging-station resolver calibration (independent from fuel constants). */
export const PRIMARY_SEARCH_RADIUS_METERS = 120;
export const FALLBACK_SEARCH_RADIUS_METERS = 300;
export const MAX_CANDIDATES = 12;

/** Beyond this geometry distance (and not inside), candidates cannot MATCH. */
export const MAX_MATCH_DISTANCE_METERS = 100;

export const SCORE_INSIDE_GEOMETRY = 100;
export const SCORE_GEOMETRY_WITHIN_20M = 70;
export const SCORE_GEOMETRY_WITHIN_25M = 60;
export const SCORE_GEOMETRY_WITHIN_50M = 45;
export const SCORE_GEOMETRY_WITHIN_100M = 25;
export const SCORE_POINT_WITHIN_20M = 55;
export const SCORE_POINT_WITHIN_50M = 35;
export const SCORE_METADATA_BONUS_FULL = 8;
export const SCORE_METADATA_BONUS_PARTIAL = 4;

export const MATCHED_HIGH_MIN_SCORE = 85;
export const MATCHED_MEDIUM_MIN_SCORE = 70;
export const MATCHED_LOW_MIN_SCORE = 55;
export const AMBIGUOUS_MIN_SCORE = 45;
export const NOT_FOUND_MAX_SCORE = 54;

export const HIGH_CONFIDENCE_MAX_GEOMETRY_DISTANCE_M = 15;
export const ABSOLUTE_SCORE_GAP_AMBIGUOUS = 20;
export const CLOSE_CANDIDATE_DISTANCE_AMBIGUOUS_M = 15;
export const RELATIVE_SCORE_GAP_AMBIGUOUS = 0.15;

export const DEDUPE_SAME_STATION_DISTANCE_M = 12;
export const DEDUPE_SAME_BRAND_DISTANCE_M = 8;
export const DEDUPE_CONTAINED_NODE_DISTANCE_M = 30;

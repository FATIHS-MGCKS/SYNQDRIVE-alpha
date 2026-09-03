/**
 * DI-EV-0034B — deterministic sparse external video Ground Truth builder.
 * Source: EXTERNAL_OWNER_PLUS_CHATGPT_MANUAL_VISUAL_REVIEW (2026-09-03).
 */
import * as crypto from 'crypto';
import {
  stableStringify,
  type ExternalGtClip,
  type ExternalGtDocument,
  type ExternalGtObservation,
} from './reference-capture-rd003-video-gt-alignment';

export const INGESTION_EVIDENCE_ID = 'DI-EV-0034B';
export const INGESTION_AUTHORITY = 'EXTERNAL_OWNER_PLUS_CHATGPT_MANUAL_VISUAL_REVIEW';
export const INGESTION_DATE = '2026-09-03';
export const SOURCE_METHOD = 'EXTERNAL_MANUAL_FRAME_REVIEW_CHATGPT_2026_09_03';

const DEFAULT_SPEED_UNCERTAINTY = 0.15;
const DEFAULT_VALUE_UNCERTAINTY = 1;

function speedObservation(
  clipSuffix: string,
  index: number,
  videoTimeSeconds: number,
  value: number,
): ExternalGtObservation {
  return {
    observationId: `RD003_GT_${clipSuffix}_SPEED_${String(index).padStart(3, '0')}`,
    videoTimeSeconds,
    videoTimeUncertaintySeconds: DEFAULT_SPEED_UNCERTAINTY,
    observationType: 'SPEED',
    value,
    unit: 'km/h',
    valueUncertainty: DEFAULT_VALUE_UNCERTAINTY,
    confidence: 'VALIDATED',
    evidenceClass: 'DIRECT_VISUAL',
    sourceMethod: SOURCE_METHOD,
    notes: null,
  };
}

function typedObservation(
  clipSuffix: string,
  typeCode: string,
  index: number,
  partial: Omit<ExternalGtObservation, 'observationId' | 'sourceMethod' | 'notes'>,
  notes: string | null = null,
): ExternalGtObservation {
  return {
    sourceMethod: SOURCE_METHOD,
    notes,
    ...partial,
    observationId: `RD003_GT_${clipSuffix}_${typeCode}_${String(index).padStart(3, '0')}`,
  };
}

function buildSpeedObservations(
  clipSuffix: string,
  points: Array<[number, number]>,
): ExternalGtObservation[] {
  return points.map(([t, v], i) => speedObservation(clipSuffix, i, t, v));
}

function sortObservations(observations: ExternalGtObservation[]): ExternalGtObservation[] {
  const typeOrder: Record<string, number> = {
    SPEED: 0,
    STOP: 1,
    CRUISE_STABLE: 2,
    CLOCK_MINUTE_TRANSITION: 3,
    SHIFT_TRANSITION: 4,
    GEAR_DISPLAY: 5,
    REVERSE_MOTION: 6,
    DIRECTION_CHANGE: 7,
  };
  return [...observations].sort((a, b) => {
    const ta = a.videoTimeSeconds ?? 0;
    const tb = b.videoTimeSeconds ?? 0;
    if (ta !== tb) return ta - tb;
    const oa = typeOrder[a.observationType] ?? 99;
    const ob = typeOrder[b.observationType] ?? 99;
    if (oa !== ob) return oa - ob;
    return a.observationId.localeCompare(b.observationId);
  });
}

type ClipSeed = Omit<ExternalGtClip, 'observations'> & {
  clipSuffix: string;
  speedPoints: Array<[number, number]>;
  extraObservations: ExternalGtObservation[];
};

const CLIP_SEEDS: ClipSeed[] = [
  {
    clipSuffix: '001',
    clipId: 'RD003_GT_CLIP_001',
    fileName: 'IMG_2803.mp4',
    videoDurationSeconds: 60,
    videoDurationUncertainty: 0.5,
    evidenceStatus: 'EXTERNAL_GT_INGESTED',
    behavioralSummary:
      'STOP → LAUNCH → STRONG_ACCELERATION → HIGH_RPM_SHIFT → LONG_GENTLE_DECELERATION',
    negativeControl: false,
    videoClock: {
      displayedLocalTime: '21:03 → 21:04',
      displayedMinuteTransitions: [
        {
          videoTimeSeconds: 10.55,
          uncertaintySeconds: 0.1,
          fromMinute: '21:03',
          toMinute: '21:04',
        },
      ],
      timezoneInterpretation: 'CEST (UTC+2) assumed — NOT VALIDATED',
      timezoneStatus: 'CANDIDATE',
      clockResolutionSeconds: 60,
      confidence: 'LOW',
    },
    candidateAbsoluteTime: {
      candidateStartUtc: '2026-09-02T19:03:49.400Z',
      uncertaintySeconds: 30,
      derivation: 'Visible vehicle clock interpreted as CEST',
      status: 'CANDIDATE_VIDEO_CLOCK_INTERPRETATION_ONLY',
    },
    speedPoints: [
      [0, 0], [1, 0], [2, 0], [3, 1], [4, 6], [5, 12], [6, 16], [7, 20], [9, 24], [10, 25],
      [11, 28], [12, 39], [13, 53], [14, 65], [15, 75], [16, 80], [20, 77], [25, 74], [30, 71],
      [35, 66], [40, 63], [45, 61], [50, 59], [55, 57], [59, 55],
    ],
    extraObservations: [
      typedObservation('001', 'CLOCK', 1, {
        videoTimeSeconds: 10.55,
        videoTimeUncertaintySeconds: 0.1,
        observationType: 'CLOCK_MINUTE_TRANSITION',
        value: '21:03→21:04',
        unit: null,
        valueUncertainty: null,
        confidence: 'VALIDATED',
        evidenceClass: 'DIRECT_VISUAL',
      }, 'GT_VALUE_VALIDATED — not telemetry alignment validated'),
    ],
  },
  {
    clipSuffix: '002',
    clipId: 'RD003_GT_CLIP_002',
    fileName: 'IMG_2804.mp4',
    videoDurationSeconds: 36.9,
    videoDurationUncertainty: 0.5,
    evidenceStatus: 'EXTERNAL_GT_INGESTED',
    behavioralSummary: 'STABLE_CRUISE negative-control baseline ~64–69 km/h',
    negativeControl: true,
    videoClock: {
      displayedLocalTime: '21:06',
      displayedMinuteTransitions: [],
      timezoneInterpretation: 'CEST (UTC+2) assumed — NOT VALIDATED',
      timezoneStatus: 'CANDIDATE',
      clockResolutionSeconds: 60,
      confidence: 'LOW',
    },
    candidateAbsoluteTime: {
      candidateStartUtc: null,
      candidateStartUtcFrom: '2026-09-02T19:06:00.000Z',
      candidateStartUtcTo: '2026-09-02T19:06:23.100Z',
      uncertaintySeconds: null,
      derivation:
        '21:06 visible throughout ~36.9 s clip with no 21:07 transition — latest start constrained by clip duration within minute (CEST)',
      status: 'CANDIDATE_VIDEO_CLOCK_INTERPRETATION_ONLY',
    },
    speedPoints: [
      [0, 64], [5, 65], [10, 66], [15, 67], [20, 68], [25, 69], [30, 67], [36, 66],
    ],
    extraObservations: [
      typedObservation('002', 'CRUISE', 1, {
        videoTimeSeconds: 18.0,
        videoTimeUncertaintySeconds: 18.0,
        observationType: 'CRUISE_STABLE',
        value: 'STABLE_CRUISE_64_69_KMH',
        unit: null,
        valueUncertainty: null,
        confidence: 'VALIDATED',
        evidenceClass: 'DIRECT_VISUAL',
      }, 'Negative-control stable cruise landmark'),
    ],
  },
  {
    clipSuffix: '003',
    clipId: 'RD003_GT_CLIP_003',
    fileName: 'IMG_2805.mp4',
    videoDurationSeconds: 24.3,
    videoDurationUncertainty: 0.5,
    evidenceStatus: 'EXTERNAL_GT_INGESTED',
    behavioralSummary:
      'ROLLING_CRUISE → STRONG_ACCELERATION → HIGH_RPM_SHIFT → CONTROLLED_DECELERATION',
    negativeControl: false,
    videoClock: {
      displayedLocalTime: '21:08 → 21:09',
      displayedMinuteTransitions: [
        {
          videoTimeSeconds: 22.72,
          uncertaintySeconds: 0.1,
          fromMinute: '21:08',
          toMinute: '21:09',
        },
      ],
      timezoneInterpretation: 'CEST (UTC+2) assumed — NOT VALIDATED',
      timezoneStatus: 'CANDIDATE',
      clockResolutionSeconds: 60,
      confidence: 'LOW',
    },
    candidateAbsoluteTime: {
      candidateStartUtc: '2026-09-02T19:08:37.300Z',
      uncertaintySeconds: 30,
      derivation: 'Visible vehicle clock interpreted as CEST',
      status: 'CANDIDATE_VIDEO_CLOCK_INTERPRETATION_ONLY',
    },
    speedPoints: [
      [0, 38], [2, 39], [4, 41], [6, 42], [8, 43], [9, 46], [10, 56], [11, 66], [12, 75],
      [13, 85], [15, 90], [16, 88], [17, 86], [18, 83], [19, 81], [20, 80], [21, 78], [22, 77],
      [23, 75], [24, 74],
    ],
    extraObservations: [
      typedObservation('003', 'CLOCK', 1, {
        videoTimeSeconds: 22.72,
        videoTimeUncertaintySeconds: 0.1,
        observationType: 'CLOCK_MINUTE_TRANSITION',
        value: '21:08→21:09',
        unit: null,
        valueUncertainty: null,
        confidence: 'VALIDATED',
        evidenceClass: 'DIRECT_VISUAL',
      }),
    ],
  },
  {
    clipSuffix: '004',
    clipId: 'RD003_GT_CLIP_004',
    fileName: 'IMG_2806.mp4',
    videoDurationSeconds: 35.3,
    videoDurationUncertainty: 0.5,
    evidenceStatus: 'EXTERNAL_GT_INGESTED',
    behavioralSummary: 'MILD_PROGRESSIVE_ACCELERATION → NEAR_STEADY → MODERATE_STRONG_ACCELERATION',
    negativeControl: false,
    videoClock: {
      displayedLocalTime: '21:09 → 21:10',
      displayedMinuteTransitions: [
        {
          videoTimeSeconds: 9.75,
          uncertaintySeconds: 0.1,
          fromMinute: '21:09',
          toMinute: '21:10',
        },
      ],
      timezoneInterpretation: 'CEST (UTC+2) assumed — NOT VALIDATED',
      timezoneStatus: 'CANDIDATE',
      clockResolutionSeconds: 60,
      confidence: 'LOW',
    },
    candidateAbsoluteTime: {
      candidateStartUtc: '2026-09-02T19:09:50.200Z',
      uncertaintySeconds: 30,
      derivation: 'Visible vehicle clock interpreted as CEST',
      status: 'CANDIDATE_VIDEO_CLOCK_INTERPRETATION_ONLY',
    },
    speedPoints: [
      [0, 70], [1, 71], [2, 71], [3, 71], [4, 72], [10, 72], [12, 74], [14, 75], [16, 77],
      [18, 79], [20, 79], [29, 78], [30, 84], [31, 91], [32, 98], [33, 102], [34, 103],
    ],
    extraObservations: [
      typedObservation('004', 'CLOCK', 1, {
        videoTimeSeconds: 9.75,
        videoTimeUncertaintySeconds: 0.1,
        observationType: 'CLOCK_MINUTE_TRANSITION',
        value: '21:09→21:10',
        unit: null,
        valueUncertainty: null,
        confidence: 'VALIDATED',
        evidenceClass: 'DIRECT_VISUAL',
      }),
    ],
  },
  {
    clipSuffix: '005',
    clipId: 'RD003_GT_CLIP_005',
    fileName: 'IMG_2807.mp4',
    videoDurationSeconds: 61.2,
    videoDurationUncertainty: 0.5,
    evidenceStatus: 'EXTERNAL_GT_INGESTED',
    behavioralSummary: 'DECELERATION → STOP → STRONG_ACCELERATION → INTERMEDIATE_DYNAMICS → CRUISE',
    negativeControl: false,
    videoClock: {
      displayedLocalTime: '21:12 → 21:13',
      displayedMinuteTransitions: [
        {
          videoTimeSeconds: 49.65,
          uncertaintySeconds: 0.1,
          fromMinute: '21:12',
          toMinute: '21:13',
        },
      ],
      timezoneInterpretation: 'CEST (UTC+2) assumed — NOT VALIDATED',
      timezoneStatus: 'CANDIDATE',
      clockResolutionSeconds: 60,
      confidence: 'LOW',
    },
    candidateAbsoluteTime: {
      candidateStartUtc: '2026-09-02T19:12:10.300Z',
      uncertaintySeconds: 30,
      derivation: 'Visible vehicle clock interpreted as CEST',
      status: 'CANDIDATE_VIDEO_CLOCK_INTERPRETATION_ONLY',
    },
    speedPoints: [
      [0, 19], [2, 9], [4, 1], [6, 0], [10.5, 19], [11, 21], [12.5, 31], [13, 37], [13.5, 43],
      [14, 48], [14.5, 52], [15, 57], [15.5, 61], [16, 64], [16.5, 66], [17, 67],
    ],
    extraObservations: [
      typedObservation('005', 'STOP', 1, {
        videoTimeSeconds: 6.0,
        videoTimeUncertaintySeconds: 0.5,
        observationType: 'STOP',
        value: 0,
        unit: 'km/h',
        valueUncertainty: DEFAULT_VALUE_UNCERTAINTY,
        confidence: 'VALIDATED',
        evidenceClass: 'DIRECT_VISUAL',
      }),
      typedObservation('005', 'CLOCK', 1, {
        videoTimeSeconds: 49.65,
        videoTimeUncertaintySeconds: 0.1,
        observationType: 'CLOCK_MINUTE_TRANSITION',
        value: '21:12→21:13',
        unit: null,
        valueUncertainty: null,
        confidence: 'VALIDATED',
        evidenceClass: 'DIRECT_VISUAL',
      }),
    ],
  },
  {
    clipSuffix: '006',
    clipId: 'RD003_GT_CLIP_006',
    fileName: 'IMG_2808.mp4',
    videoDurationSeconds: 45.8,
    videoDurationUncertainty: 0.5,
    evidenceStatus: 'EXTERNAL_GT_INGESTED',
    behavioralSummary:
      'STOP → PROGRESSIVE_ACCELERATION → STRONGER_ACCELERATION → PLATEAU → LONG_CONTROLLED_DECELERATION',
    negativeControl: false,
    videoClock: {
      displayedLocalTime: '21:21',
      displayedMinuteTransitions: [],
      timezoneInterpretation: 'CEST (UTC+2) assumed — NOT VALIDATED',
      timezoneStatus: 'CANDIDATE',
      clockResolutionSeconds: 60,
      confidence: 'LOW',
    },
    candidateAbsoluteTime: {
      candidateStartUtc: null,
      candidateStartUtcFrom: '2026-09-02T19:21:00.000Z',
      candidateStartUtcTo: '2026-09-02T19:21:14.000Z',
      uncertaintySeconds: null,
      derivation: 'Candidate region ~19:21:00Z–19:21:14Z; exact second unresolved',
      status: 'CANDIDATE_VIDEO_CLOCK_INTERPRETATION_ONLY',
    },
    speedPoints: [
      [0, 0], [1, 0], [2, 0], [3, 0], [6, 10], [7, 13], [9, 22], [10, 27], [11, 31], [12, 34],
      [13, 37], [14, 40], [15, 42], [16, 45], [17, 47], [18, 51], [19, 59], [20, 67], [21, 75],
      [22, 80], [23, 83], [24, 85], [25, 86], [26, 87], [27, 87], [28, 87], [29, 86], [30, 85],
      [31, 84], [32, 84], [33, 83], [34, 82], [35, 80], [36, 79], [37, 78], [38, 77], [39, 76],
      [40, 75], [41, 73], [42, 71], [43, 69], [44, 68], [45, 68],
    ],
    extraObservations: [
      typedObservation('006', 'STOP', 1, {
        videoTimeSeconds: 1.5,
        videoTimeUncertaintySeconds: 1.5,
        observationType: 'STOP',
        value: 0,
        unit: 'km/h',
        valueUncertainty: DEFAULT_VALUE_UNCERTAINTY,
        confidence: 'VALIDATED',
        evidenceClass: 'DIRECT_VISUAL',
      }, 'Initial STOP state landmark'),
    ],
  },
  {
    clipSuffix: '007',
    clipId: 'RD003_GT_CLIP_007',
    fileName: 'IMG_2809.mp4',
    videoDurationSeconds: 31.5,
    videoDurationUncertainty: 0.5,
    evidenceStatus: 'EXTERNAL_GT_INGESTED',
    behavioralSummary: 'STABLE_CRUISE → CONTROLLED_DECELERATION (negative-control segment in early cruise)',
    negativeControl: true,
    videoClock: {
      displayedLocalTime: '21:22 → 21:23',
      displayedMinuteTransitions: [
        {
          videoTimeSeconds: 29.55,
          uncertaintySeconds: 0.1,
          fromMinute: '21:22',
          toMinute: '21:23',
        },
      ],
      timezoneInterpretation: 'CEST (UTC+2) assumed — NOT VALIDATED',
      timezoneStatus: 'CANDIDATE',
      clockResolutionSeconds: 60,
      confidence: 'LOW',
    },
    candidateAbsoluteTime: {
      candidateStartUtc: '2026-09-02T19:22:30.450Z',
      uncertaintySeconds: 30,
      derivation: 'Visible vehicle clock interpreted as CEST',
      status: 'CANDIDATE_VIDEO_CLOCK_INTERPRETATION_ONLY',
    },
    speedPoints: [
      [0, 61], [5, 61], [10, 61], [15, 61], [18, 61], [19, 60], [20, 60], [21, 60], [22, 59],
      [23, 59], [24, 58], [25, 58], [26, 57], [27, 56], [28, 53], [29, 50], [30, 47], [31, 45],
    ],
    extraObservations: [
      typedObservation('007', 'CRUISE', 1, {
        videoTimeSeconds: 9.0,
        videoTimeUncertaintySeconds: 9.0,
        observationType: 'CRUISE_STABLE',
        value: 'STABLE_CRUISE_APPROX_61_KMH',
        unit: null,
        valueUncertainty: null,
        confidence: 'VALIDATED',
        evidenceClass: 'DIRECT_VISUAL',
      }, 'Negative-control stable cruise landmark'),
      typedObservation('007', 'CLOCK', 1, {
        videoTimeSeconds: 29.55,
        videoTimeUncertaintySeconds: 0.1,
        observationType: 'CLOCK_MINUTE_TRANSITION',
        value: '21:22→21:23',
        unit: null,
        valueUncertainty: null,
        confidence: 'VALIDATED',
        evidenceClass: 'DIRECT_VISUAL',
      }),
    ],
  },
  {
    clipSuffix: '008',
    clipId: 'RD003_GT_CLIP_008',
    fileName: 'IMG_2810.mp4',
    videoDurationSeconds: 21.4,
    videoDurationUncertainty: 0.5,
    evidenceStatus: 'EXTERNAL_GT_INGESTED',
    behavioralSummary:
      'STRONG_ACCELERATION → EXPLICIT_VISIBLE_SHIFT (S2→S3 ~t=9.5–9.6s) → CONTROLLED_DECELERATION',
    negativeControl: false,
    videoClock: {
      displayedLocalTime: '21:23',
      displayedMinuteTransitions: [],
      timezoneInterpretation: 'CEST (UTC+2) assumed — NOT VALIDATED',
      timezoneStatus: 'CANDIDATE',
      clockResolutionSeconds: 60,
      confidence: 'LOW',
    },
    candidateAbsoluteTime: {
      candidateStartUtc: null,
      candidateStartUtcFrom: '2026-09-02T19:23:00.000Z',
      candidateStartUtcTo: '2026-09-02T19:23:38.600Z',
      uncertaintySeconds: null,
      derivation:
        '21:23 visible throughout ~21.4 s clip with no 21:24 transition — latest start constrained by clip duration within minute (CEST)',
      status: 'CANDIDATE_VIDEO_CLOCK_INTERPRETATION_ONLY',
    },
    speedPoints: [
      [7, 48], [7.5, 55], [8, 60], [8.5, 66], [9, 70], [9.5, 75], [10, 79], [10.5, 83], [11, 87],
      [12, 91],
    ],
    extraObservations: [
      typedObservation('008', 'SHIFT', 1, {
        videoTimeSeconds: 9.55,
        videoTimeUncertaintySeconds: 0.05,
        observationType: 'SHIFT_TRANSITION',
        value: 'S2→S3',
        unit: null,
        valueUncertainty: null,
        confidence: 'VALIDATED',
        evidenceClass: 'DIRECT_VISUAL',
      }, 'Video gear observation — not powertrainTransmissionActualGear timing proof'),
      typedObservation('008', 'GEAR', 1, {
        videoTimeSeconds: 9.5,
        videoTimeUncertaintySeconds: 0.05,
        observationType: 'GEAR_DISPLAY',
        value: 'S2',
        unit: null,
        valueUncertainty: null,
        confidence: 'VALIDATED',
        evidenceClass: 'DIRECT_VISUAL',
      }),
      typedObservation('008', 'GEAR', 2, {
        videoTimeSeconds: 9.6,
        videoTimeUncertaintySeconds: 0.05,
        observationType: 'GEAR_DISPLAY',
        value: 'S3',
        unit: null,
        valueUncertainty: null,
        confidence: 'VALIDATED',
        evidenceClass: 'DIRECT_VISUAL',
      }),
    ],
  },
  {
    clipSuffix: '009',
    clipId: 'RD003_GT_CLIP_009',
    fileName: 'IMG_2811.mp4',
    videoDurationSeconds: 34.3,
    videoDurationUncertainty: 0.5,
    evidenceStatus: 'EXTERNAL_GT_INGESTED',
    behavioralSummary:
      'FORWARD → DECELERATION → NEAR_STOP → REVERSE → STOP → R_TO_D → FORWARD_LAUNCH',
    negativeControl: false,
    videoClock: {
      displayedLocalTime: '21:24 → 21:25',
      displayedMinuteTransitions: [
        {
          videoTimeSeconds: null,
          uncertaintySeconds: null,
          fromMinute: '21:24',
          toMinute: '21:25',
        },
      ],
      timezoneInterpretation: 'CEST (UTC+2) assumed — NOT VALIDATED',
      timezoneStatus: 'CANDIDATE',
      clockResolutionSeconds: 60,
      confidence: 'LOW',
    },
    candidateAbsoluteTime: {
      candidateStartUtc: null,
      candidateStartUtcFrom: '2026-09-02T19:24:29.000Z',
      candidateStartUtcTo: '2026-09-02T19:24:32.000Z',
      uncertaintySeconds: null,
      derivation: 'Candidate region ~19:24:29Z–19:24:32Z',
      status: 'CANDIDATE_VIDEO_CLOCK_INTERPRETATION_ONLY',
    },
    speedPoints: [
      [0, 47], [1, 47], [2, 46], [3, 46], [4, 47], [5, 48], [6, 49], [7, 50], [8, 50], [9, 50],
      [10, 49], [11, 46], [12, 39], [13, 31], [16, 12], [17, 7], [23, 4], [24, 3], [27, 0],
      [28, 1], [30, 12], [31, 17], [32, 20], [33, 22], [34, 23],
    ],
    extraObservations: [
      typedObservation('009', 'REVERSE', 1, {
        videoTimeSeconds: 23.5,
        videoTimeUncertaintySeconds: 1.5,
        observationType: 'REVERSE_MOTION',
        value: 'REVERSE',
        unit: null,
        valueUncertainty: null,
        confidence: 'VALIDATED',
        evidenceClass: 'DIRECT_VISUAL',
      }, 'Direction landmark — speed magnitude alone does not establish reverse'),
      typedObservation('009', 'STOP', 1, {
        videoTimeSeconds: 27.0,
        videoTimeUncertaintySeconds: 0.5,
        observationType: 'STOP',
        value: 0,
        unit: 'km/h',
        valueUncertainty: DEFAULT_VALUE_UNCERTAINTY,
        confidence: 'VALIDATED',
        evidenceClass: 'DIRECT_VISUAL',
      }),
      typedObservation('009', 'GEAR', 1, {
        videoTimeSeconds: 27.0,
        videoTimeUncertaintySeconds: 0.5,
        observationType: 'GEAR_DISPLAY',
        value: 'D',
        unit: null,
        valueUncertainty: null,
        confidence: 'VALIDATED',
        evidenceClass: 'DIRECT_VISUAL',
      }),
      typedObservation('009', 'DIRECTION', 1, {
        videoTimeSeconds: 27.0,
        videoTimeUncertaintySeconds: 1.0,
        observationType: 'DIRECTION_CHANGE',
        value: 'REVERSE_TO_FORWARD',
        unit: null,
        valueUncertainty: null,
        confidence: 'VALIDATED',
        evidenceClass: 'DIRECT_VISUAL',
      }),
    ],
  },
];

export function buildExternalGtDocument(): ExternalGtDocument {
  const clips: ExternalGtClip[] = CLIP_SEEDS.map((seed) => {
    const { clipSuffix, speedPoints, extraObservations, ...clipMeta } = seed;
    const observations = sortObservations([
      ...buildSpeedObservations(clipSuffix, speedPoints),
      ...extraObservations,
    ]);
    return { ...clipMeta, observations };
  });

  return {
    schemaVersion: '2026-09-03-rd003-video-gt-observations-v2',
    evidenceId: 'DI-EV-0034A',
    referenceDriveId: 'DIMO_LTE_R1_REFERENCE_DRIVE_003',
    sessionId: '0fa040aa-6105-4872-9b2c-f8ad477009b8',
    ingestionEvidenceId: INGESTION_EVIDENCE_ID,
    ingestionAuthority: INGESTION_AUTHORITY,
    ingestionDate: INGESTION_DATE,
    ingestionStatus: 'REAL_EXTERNAL_GT_INGESTED',
    note:
      'Sparse externally reviewed video Ground Truth (DI-EV-0034B). VALIDATED denotes external visual observation authority — not telemetry alignment validation. observations[] are not interpolated to video frame rate.',
    clips,
  } as ExternalGtDocument & {
    ingestionEvidenceId: string;
    ingestionAuthority: string;
    ingestionDate: string;
  };
}

export function externalGtDocumentSha256(doc: ExternalGtDocument): string {
  return crypto.createHash('sha256').update(stableStringify(doc)).digest('hex');
}

export function countRawExternalGtObservationsAllClips(doc: ExternalGtDocument): number {
  return doc.clips.reduce((sum, clip) => sum + clip.observations.length, 0);
}

export function countAlignmentEligibleSpeedGtPoints(doc: ExternalGtDocument): number {
  return doc.clips.reduce(
    (sum, clip) =>
      sum +
      clip.observations.filter(
        (o) =>
          o.observationType === 'SPEED' &&
          o.confidence === 'VALIDATED' &&
          o.evidenceClass === 'DIRECT_VISUAL',
      ).length,
    0,
  );
}

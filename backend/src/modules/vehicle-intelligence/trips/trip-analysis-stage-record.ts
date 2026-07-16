import type { AnalysisStageName, AnalysisStageState } from './trip-analysis-status';

export interface AnalysisStageRecord {
  state: AnalysisStageState;
  errorCode?: string | null;
  attempts?: number;
  completedAt?: string | null;
}

export type AnalysisStagesDocument = Partial<Record<AnalysisStageName, AnalysisStageRecord>>;

const STAGE_NAMES: AnalysisStageName[] = [
  'behavior',
  'nativeEvents',
  'route',
  'eventContext',
  'misuse',
  'drivingImpact',
  'attribution',
];

const TERMINAL_STATES: AnalysisStageState[] = [
  'done',
  'skipped',
  'failed',
  'not_assessable',
];

export function emptyAnalysisStagesDocument(): AnalysisStagesDocument {
  return Object.fromEntries(
    STAGE_NAMES.map((name) => [name, { state: 'pending', attempts: 0 } satisfies AnalysisStageRecord]),
  ) as AnalysisStagesDocument;
}

function isLegacyStageState(value: unknown): value is AnalysisStageState {
  return (
    value === 'pending' ||
    value === 'done' ||
    value === 'skipped' ||
    value === 'failed' ||
    value === 'not_assessable'
  );
}

function parseStageRecord(value: unknown, fallbackState: AnalysisStageState = 'pending'): AnalysisStageRecord {
  if (isLegacyStageState(value)) {
    return {
      state: value,
      attempts: TERMINAL_STATES.includes(value) ? 1 : 0,
      completedAt: TERMINAL_STATES.includes(value) ? null : null,
      errorCode: value === 'failed' ? null : null,
    };
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { state: fallbackState, attempts: 0 };
  }

  const raw = value as Record<string, unknown>;
  const state = isLegacyStageState(raw.state) ? raw.state : fallbackState;
  return {
    state,
    errorCode: typeof raw.errorCode === 'string' ? raw.errorCode : raw.errorCode === null ? null : undefined,
    attempts: typeof raw.attempts === 'number' && Number.isFinite(raw.attempts) ? raw.attempts : 0,
    completedAt: typeof raw.completedAt === 'string' ? raw.completedAt : raw.completedAt === null ? null : undefined,
  };
}

/** Parse persisted JSON supporting legacy string states and enriched stage records. */
export function parseAnalysisStagesDocument(value: unknown): AnalysisStagesDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return emptyAnalysisStagesDocument();
  }

  const raw = value as Record<string, unknown>;
  const behavior = parseStageRecord(raw.behavior, 'pending');

  const doc: AnalysisStagesDocument = {
    behavior,
    route: parseStageRecord(raw.route, 'pending'),
    misuse: parseStageRecord(raw.misuse, 'pending'),
    drivingImpact: parseStageRecord(raw.drivingImpact, 'pending'),
    nativeEvents: parseStageRecord(raw.nativeEvents, behavior.state),
    eventContext: parseStageRecord(raw.eventContext, behavior.state),
    attribution: parseStageRecord(
      raw.attribution,
      behavior.state === 'done' ? 'done' : 'pending',
    ),
  };

  return doc;
}

export function getStageRecord(
  doc: AnalysisStagesDocument,
  stage: AnalysisStageName,
): AnalysisStageRecord {
  return doc[stage] ?? { state: 'pending', attempts: 0 };
}

export function getStageState(
  doc: AnalysisStagesDocument,
  stage: AnalysisStageName,
): AnalysisStageState {
  return getStageRecord(doc, stage).state;
}

export function isStageTerminalState(state: AnalysisStageState): boolean {
  return TERMINAL_STATES.includes(state);
}

export interface UpdateStageRecordInput {
  state: AnalysisStageState;
  errorCode?: string | null;
  completedAt?: Date | null;
  incrementAttempt?: boolean;
}

export function updateStageRecord(
  doc: AnalysisStagesDocument,
  stage: AnalysisStageName,
  input: UpdateStageRecordInput,
): AnalysisStagesDocument {
  const existing = getStageRecord(doc, stage);
  const attempts = existing.attempts ?? 0;
  const nextAttempts = input.incrementAttempt === false ? attempts : attempts + 1;
  const completedAt =
    input.completedAt !== undefined
      ? input.completedAt?.toISOString() ?? null
      : isStageTerminalState(input.state)
        ? existing.completedAt ?? new Date().toISOString()
        : null;

  return {
    ...doc,
    [stage]: {
      state: input.state,
      attempts: nextAttempts,
      completedAt,
      errorCode: input.errorCode !== undefined ? input.errorCode : existing.errorCode ?? null,
    },
  };
}

/** Flat state map for resolver/backward-compatible helpers. */
export function flattenStageStates(doc: AnalysisStagesDocument): Record<AnalysisStageName, AnalysisStageState> {
  return Object.fromEntries(
    STAGE_NAMES.map((name) => [name, getStageState(doc, name)]),
  ) as Record<AnalysisStageName, AnalysisStageState>;
}

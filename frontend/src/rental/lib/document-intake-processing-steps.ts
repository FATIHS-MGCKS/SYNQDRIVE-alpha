import type { FlowStatus } from '../components/documents/document-extraction.shared';
import type {
  DocumentExtractionErrorPhase,
  DocumentExtractionStage,
  DocumentExtractionStatus,
} from './document-extraction.types';

export type IntakeProcessingStepId =
  | 'file_check'
  | 'file_stored'
  | 'text_recognition'
  | 'classification'
  | 'data_preparation'
  | 'ready_for_review';

export type IntakeProcessingStepState = 'pending' | 'active' | 'complete' | 'failed';

export interface IntakeProcessingStepView {
  id: IntakeProcessingStepId;
  state: IntakeProcessingStepState;
  /** User-facing label (already translated). */
  label: string;
  /** Optional active-state detail (e.g. awaiting document type). */
  detail?: string | null;
}

export interface BuildIntakeProcessingStepsInput {
  flow: FlowStatus;
  status?: DocumentExtractionStatus | null;
  processingStage?: DocumentExtractionStage | null;
  errorPhase?: DocumentExtractionErrorPhase | null;
  labels: Record<IntakeProcessingStepId, string>;
  awaitingTypeDetail?: string | null;
  retryDetail?: string | null;
}

const STEP_ORDER: IntakeProcessingStepId[] = [
  'file_check',
  'file_stored',
  'text_recognition',
  'classification',
  'data_preparation',
  'ready_for_review',
];

const ERROR_PHASE_TO_STEP: Record<DocumentExtractionErrorPhase, IntakeProcessingStepId> = {
  UPLOAD: 'file_check',
  STORAGE: 'file_stored',
  QUEUE: 'file_stored',
  OCR: 'text_recognition',
  CLASSIFICATION: 'classification',
  EXTRACTION: 'data_preparation',
  VALIDATION: 'data_preparation',
  APPLY: 'ready_for_review',
  UNKNOWN: 'file_check',
};

function stepIndex(id: IntakeProcessingStepId): number {
  return STEP_ORDER.indexOf(id);
}

export function errorPhaseToProcessingStep(
  errorPhase: DocumentExtractionErrorPhase | null | undefined,
): IntakeProcessingStepId {
  if (!errorPhase) return 'file_check';
  return ERROR_PHASE_TO_STEP[errorPhase] ?? 'file_check';
}

/** Maps live server/client flow signals to the active step index (0–5). */
export function resolveActiveProcessingStepIndex(input: {
  flow: FlowStatus;
  status?: DocumentExtractionStatus | null;
  processingStage?: DocumentExtractionStage | null;
  errorPhase?: DocumentExtractionErrorPhase | null;
  failed?: boolean;
}): number {
  const { flow, status, processingStage, errorPhase, failed } = input;

  if (failed || flow === 'failed') {
    return stepIndex(errorPhaseToProcessingStep(errorPhase));
  }

  if (flow === 'ready' || status === 'READY_FOR_REVIEW') {
    return stepIndex('ready_for_review');
  }

  if (flow === 'awaiting_type' || status === 'AWAITING_DOCUMENT_TYPE') {
    return stepIndex('classification');
  }

  if (flow === 'validating' || flow === 'uploading') {
    return stepIndex('file_check');
  }

  if (flow === 'stored') {
    return stepIndex('file_stored');
  }

  if (flow === 'queued' || flow === 'retrying' || status === 'QUEUED' || status === 'PENDING') {
    return stepIndex('file_stored');
  }

  if (flow === 'ocr') {
    return stepIndex('text_recognition');
  }

  if (flow === 'classifying') {
    return stepIndex('classification');
  }

  if (flow === 'extracting' || flow === 'validating_plausibility') {
    return stepIndex('data_preparation');
  }

  if (flow === 'applying' || status === 'CONFIRMED') {
    return stepIndex('ready_for_review');
  }

  if (status === 'PROCESSING' && processingStage) {
    switch (processingStage) {
      case 'UPLOAD':
        return stepIndex('file_check');
      case 'STORAGE':
      case 'QUEUE':
        return stepIndex('file_stored');
      case 'OCR':
        return stepIndex('text_recognition');
      case 'CLASSIFICATION':
        return stepIndex('classification');
      case 'EXTRACTION':
      case 'VALIDATION':
        return stepIndex('data_preparation');
      case 'REVIEW':
        return stepIndex('ready_for_review');
      case 'APPLY':
        return stepIndex('ready_for_review');
      default:
        return stepIndex('file_stored');
    }
  }

  if (flow === 'processing') {
    return stepIndex('file_stored');
  }

  return stepIndex('file_check');
}

export function buildIntakeProcessingSteps(input: BuildIntakeProcessingStepsInput): IntakeProcessingStepView[] {
  const failed = input.flow === 'failed' || input.status === 'FAILED' || input.status === 'REJECTED';
  const activeIndex = resolveActiveProcessingStepIndex({
    flow: input.flow,
    status: input.status,
    processingStage: input.processingStage,
    errorPhase: input.errorPhase,
    failed,
  });

  const awaitingType =
    input.flow === 'awaiting_type' || input.status === 'AWAITING_DOCUMENT_TYPE';
  const retrying = input.flow === 'retrying';

  return STEP_ORDER.map((id, index) => {
    let state: IntakeProcessingStepState = 'pending';
    if (failed && index === activeIndex) {
      state = 'failed';
    } else if (index < activeIndex) {
      state = 'complete';
    } else if (!failed && index === activeIndex) {
      state = input.flow === 'ready' || input.status === 'READY_FOR_REVIEW' ? 'complete' : 'active';
    } else if (!failed && input.flow === 'ready' && id === 'ready_for_review') {
      state = 'complete';
    }

    let detail: string | null | undefined;
    if (state === 'failed') {
      detail = input.retryDetail ?? null;
    } else if (awaitingType && id === 'classification' && state === 'active') {
      detail = input.awaitingTypeDetail ?? null;
    } else if (retrying && state === 'active') {
      detail = input.retryDetail ?? null;
    }

    return {
      id,
      state,
      label: input.labels[id],
      detail,
    };
  });
}

export function formatProcessingElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds} Sek.`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes} Min. ${seconds} Sek.` : `${minutes} Min.`;
}

export function shouldShowProcessingSteps(flow: FlowStatus): boolean {
  return [
    'validating',
    'uploading',
    'stored',
    'queued',
    'retrying',
    'processing',
    'ocr',
    'classifying',
    'extracting',
    'validating_plausibility',
    'awaiting_type',
    'applying',
    'failed',
  ].includes(flow);
}

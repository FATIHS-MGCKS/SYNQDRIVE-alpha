import type {
  HandoverDraftStepId,
  HandoverSessionDraftPayload,
} from './handover-session-draft.types';

export interface CreateHandoverDraftBodyDto {
  currentStep?: HandoverDraftStepId;
  draft?: Partial<HandoverSessionDraftPayload>;
  actualStationId?: string | null;
}

export interface UpdateHandoverDraftBodyDto {
  expectedVersion: number;
  currentStep?: HandoverDraftStepId;
  draft?: Partial<HandoverSessionDraftPayload>;
  validateStep?: HandoverDraftStepId;
  actualStationId?: string | null;
  acquireLock?: boolean;
}

export interface CancelHandoverDraftBodyDto {
  expectedVersion?: number;
  cancelReason?: string | null;
}

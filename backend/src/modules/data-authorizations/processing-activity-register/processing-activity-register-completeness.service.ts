import { Injectable } from '@nestjs/common';
import {
  DataProcessingAgreementStatus,
  DataSharingAuthorizationStatus,
  LegalBasisConsentRequirement,
  PrivacyPolicyLifecycleStatus,
  ProcessingActivityDpiaStatus,
  ProviderAccessGrantStatus,
} from '@prisma/client';
import {
  REGISTER_BLOCKING_FIELDS,
  REGISTER_COMPLETENESS_STATUS,
  REGISTER_FIELD_KEYS,
  type RegisterCompletenessStatus,
  type RegisterFieldKey,
} from './processing-activity-register.constants';

export interface RegisterCompletenessInput {
  title: string;
  purposeSummary: string | null;
  dataCategories: string[];
  purposes: string[];
  dataSubjectTypes: string[];
  recipientCategoriesSummary: string | null;
  dataSharingAuthorizations: Array<{
    status: DataSharingAuthorizationStatus;
    transferCountry: string | null;
    transferMechanism: string | null;
    recipient: string;
  }>;
  retentionDescription: string | null;
  retentionPeriodDays: number | null;
  technicalOrganizationalMeasures: string | null;
  controllerReference: string | null;
  dataProcessingAgreements: Array<{ status: DataProcessingAgreementStatus; processorName: string }>;
  jointControllerSummary: string | null;
  legalBasisAssessments: Array<{
    status: PrivacyPolicyLifecycleStatus;
    legalBasisType: string;
    reviewDate: Date | null;
  }>;
  dpiaStatus: ProcessingActivityDpiaStatus;
  hasCurrentRiskAssessment: boolean;
  nextReviewDate: Date | null;
  ownerUserId: string | null;
  ownerRole: string;
}

export interface RegisterFieldCompleteness {
  key: RegisterFieldKey;
  present: boolean;
  blocking: boolean;
  label: string;
  detail?: string;
}

export interface RegisterCompletenessResult {
  status: RegisterCompletenessStatus;
  completedFields: number;
  totalFields: number;
  fields: RegisterFieldCompleteness[];
  blockingGaps: RegisterFieldKey[];
  disclaimer: string;
}

const FIELD_LABELS: Record<RegisterFieldKey, string> = {
  title: 'Name der Verarbeitung',
  purposeSummary: 'Zweck der Verarbeitung',
  dataCategories: 'Datenkategorien',
  processingPurposes: 'Verarbeitungsvorgänge',
  dataSubjectTypes: 'Kategorien betroffener Personen',
  recipientCategories: 'Empfängerkategorien',
  internationalTransfers: 'Internationale Übermittlungen',
  retention: 'Aufbewahrungsfristen',
  technicalOrganizationalMeasures: 'Technische und organisatorische Maßnahmen',
  controller: 'Verantwortlicher',
  processors: 'Auftragsverarbeiter',
  legalBasis: 'Rechtsgrundlage',
  dpiaStatus: 'DPIA-Status',
  reviewDate: 'Reviewdatum',
  owner: 'Owner',
};

@Injectable()
export class ProcessingActivityRegisterCompletenessService {
  evaluate(input: RegisterCompletenessInput): RegisterCompletenessResult {
    const hasActiveLegalBasis = input.legalBasisAssessments.some(
      (a) =>
        a.status === PrivacyPolicyLifecycleStatus.ACTIVE ||
        a.status === PrivacyPolicyLifecycleStatus.APPROVED,
    );

    const hasRetention =
      Boolean(input.retentionDescription?.trim()) || input.retentionPeriodDays != null;

    const authorizedSharing = input.dataSharingAuthorizations.filter(
      (s) => s.status === DataSharingAuthorizationStatus.AUTHORIZED,
    );

    const hasIntlTransfer =
      authorizedSharing.some((s) => Boolean(s.transferCountry?.trim())) ||
      authorizedSharing.some((s) => Boolean(s.transferMechanism));

    const activeProcessors = input.dataProcessingAgreements.filter(
      (d) => d.status === DataProcessingAgreementStatus.ACTIVE,
    );

    const fields: RegisterFieldCompleteness[] = [
      this.field('title', Boolean(input.title?.trim())),
      this.field('purposeSummary', Boolean(input.purposeSummary?.trim())),
      this.field('dataCategories', input.dataCategories.length > 0),
      this.field('processingPurposes', input.purposes.length > 0),
      this.field('dataSubjectTypes', input.dataSubjectTypes.length > 0),
      this.field(
        'recipientCategories',
        Boolean(input.recipientCategoriesSummary?.trim()) || authorizedSharing.length > 0,
      ),
      this.field('internationalTransfers', hasIntlTransfer, false),
      this.field('retention', hasRetention, true),
      this.field(
        'technicalOrganizationalMeasures',
        Boolean(input.technicalOrganizationalMeasures?.trim()),
      ),
      this.field('controller', Boolean(input.controllerReference?.trim())),
      this.field('processors', activeProcessors.length > 0, false),
      this.field(
        'legalBasis',
        hasActiveLegalBasis,
        true,
        hasActiveLegalBasis ? undefined : 'Keine gültige Rechtsgrundlage hinterlegt',
      ),
      this.field(
        'dpiaStatus',
        input.hasCurrentRiskAssessment ||
          input.dpiaStatus === ProcessingActivityDpiaStatus.DPIA_APPROVED ||
          input.dpiaStatus === ProcessingActivityDpiaStatus.DPIA_IN_PROGRESS ||
          input.dpiaStatus === ProcessingActivityDpiaStatus.DPIA_REQUIRED ||
          input.dpiaStatus === ProcessingActivityDpiaStatus.DPIA_REJECTED ||
          input.dpiaStatus === ProcessingActivityDpiaStatus.DPIA_REVIEW_DUE,
        false,
      ),
      this.field(
        'reviewDate',
        Boolean(input.nextReviewDate) ||
          input.legalBasisAssessments.some((a) => Boolean(a.reviewDate)),
      ),
      this.field('owner', Boolean(input.ownerUserId) || input.ownerRole !== 'SYSTEM'),
    ];

  if (input.jointControllerSummary?.trim()) {
      // joint controllership is optional — not in required field count but noted in detail
    }

    const completedFields = fields.filter((f) => f.present).length;
    const blockingGaps = fields.filter((f) => f.blocking && !f.present).map((f) => f.key);
    const requiredFields = fields.filter((f) => REGISTER_FIELD_KEYS.includes(f.key));
    const status = this.resolveStatus(completedFields, requiredFields.length, blockingGaps);

    return {
      status,
      completedFields,
      totalFields: requiredFields.length,
      fields,
      blockingGaps,
      disclaimer:
        'Vollständigkeitsstatus basiert auf technisch gepflegten Pflichtfeldern — keine juristische Vollständigkeitsgarantie.',
    };
  }

  private field(
    key: RegisterFieldKey,
    present: boolean,
    blocking = REGISTER_BLOCKING_FIELDS.includes(key),
    detail?: string,
  ): RegisterFieldCompleteness {
    return {
      key,
      present,
      blocking,
      label: FIELD_LABELS[key],
      detail,
    };
  }

  private resolveStatus(
    completed: number,
    total: number,
    blockingGaps: RegisterFieldKey[],
  ): RegisterCompletenessStatus {
    if (blockingGaps.length > 0) {
      return REGISTER_COMPLETENESS_STATUS.INCOMPLETE;
    }
    if (completed >= total) {
      return REGISTER_COMPLETENESS_STATUS.COMPLETE_FOR_TECHNICAL_SCOPE;
    }
    if (completed >= Math.ceil(total * 0.6)) {
      return REGISTER_COMPLETENESS_STATUS.PARTIALLY_COMPLETE;
    }
    return REGISTER_COMPLETENESS_STATUS.INCOMPLETE;
  }
}

export function summarizeProviderAccess(
  grants: Array<{ providerStatus: ProviderAccessGrantStatus; provider: string }>,
): string {
  const active = grants.filter((g) => g.providerStatus === ProviderAccessGrantStatus.ACTIVE);
  if (active.length === 0) return 'Keine aktiven Providerzugriffe';
  return active.map((g) => g.provider).join(', ');
}

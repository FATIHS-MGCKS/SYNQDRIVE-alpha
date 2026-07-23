import {
  AuthorizationActorType,
  ConsentInteractionChannel,
  DataSharingAuthorizationStatus,
  DataSubjectConsentStatus,
  DataSubjectType,
  ProviderAccessGrantStatus,
} from '@prisma/client';

export const DATA_SUBJECT_CONSENT_TRANSITIONS: Record<
  DataSubjectConsentStatus,
  DataSubjectConsentStatus[]
> = {
  [DataSubjectConsentStatus.PENDING]: [DataSubjectConsentStatus.GRANTED],
  [DataSubjectConsentStatus.GRANTED]: [
    DataSubjectConsentStatus.WITHDRAWN,
    DataSubjectConsentStatus.EXPIRED,
  ],
  [DataSubjectConsentStatus.WITHDRAWN]: [],
  [DataSubjectConsentStatus.EXPIRED]: [],
};

export const PROVIDER_ACCESS_GRANT_TRANSITIONS: Record<
  ProviderAccessGrantStatus,
  ProviderAccessGrantStatus[]
> = {
  [ProviderAccessGrantStatus.PENDING]: [ProviderAccessGrantStatus.ACTIVE],
  [ProviderAccessGrantStatus.ACTIVE]: [
    ProviderAccessGrantStatus.REVOKED,
    ProviderAccessGrantStatus.EXPIRED,
  ],
  [ProviderAccessGrantStatus.REVOKED]: [],
  [ProviderAccessGrantStatus.EXPIRED]: [],
};

export const DATA_SHARING_AUTHORIZATION_TRANSITIONS: Record<
  DataSharingAuthorizationStatus,
  DataSharingAuthorizationStatus[]
> = {
  [DataSharingAuthorizationStatus.PENDING]: [DataSharingAuthorizationStatus.AUTHORIZED],
  [DataSharingAuthorizationStatus.AUTHORIZED]: [
    DataSharingAuthorizationStatus.REVOKED,
    DataSharingAuthorizationStatus.EXPIRED,
  ],
  [DataSharingAuthorizationStatus.REVOKED]: [],
  [DataSharingAuthorizationStatus.EXPIRED]: [],
};

export function assertConsentTransition(
  from: DataSubjectConsentStatus,
  to: DataSubjectConsentStatus,
): void {
  if (!(DATA_SUBJECT_CONSENT_TRANSITIONS[from] ?? []).includes(to)) {
    throw new Error(`consent_transition_not_allowed:${from}:${to}`);
  }
}

export function assertProviderGrantTransition(
  from: ProviderAccessGrantStatus,
  to: ProviderAccessGrantStatus,
): void {
  if (!(PROVIDER_ACCESS_GRANT_TRANSITIONS[from] ?? []).includes(to)) {
    throw new Error(`provider_grant_transition_not_allowed:${from}:${to}`);
  }
}

export function assertSharingTransition(
  from: DataSharingAuthorizationStatus,
  to: DataSharingAuthorizationStatus,
): void {
  if (!(DATA_SHARING_AUTHORIZATION_TRANSITIONS[from] ?? []).includes(to)) {
    throw new Error(`sharing_transition_not_allowed:${from}:${to}`);
  }
}

export function assertDataSubjectReferencePresent(
  subjectType: DataSubjectType,
  dataSubjectReference: string | null | undefined,
): void {
  const ref = (dataSubjectReference ?? '').trim();
  if (!ref) {
    throw new Error('data_subject_reference_required');
  }
  if (ref.length < 8) {
    throw new Error('data_subject_reference_too_short');
  }
}

export function assertConsentVersionsPresent(
  consentTextVersion: string | null | undefined,
  privacyNoticeVersion: string | null | undefined,
): void {
  if (!(consentTextVersion ?? '').trim()) {
    throw new Error('consent_text_version_required');
  }
  if (!(privacyNoticeVersion ?? '').trim()) {
    throw new Error('privacy_notice_version_required');
  }
}

export interface StatusEventInput {
  organizationId: string;
  actorType: AuthorizationActorType;
  actorId?: string | null;
  channel?: ConsentInteractionChannel | null;
  reason?: string | null;
}

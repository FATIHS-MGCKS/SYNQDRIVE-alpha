import { PrivacyPolicyLifecycleStatus } from '@prisma/client';

/**
 * Fachliche Statusbedeutungen (Prompt 28).
 * REJECTED war niemals aktiv; REVOKED war wirksam und wurde beendet.
 */
export const POLICY_STATUS_SEMANTICS: Readonly<
  Record<
    PrivacyPolicyLifecycleStatus,
    {
      readonly label: string;
      readonly description: string;
      readonly wasEverOperational: boolean;
      readonly isTerminal: boolean;
      readonly isReversible: boolean;
    }
  >
> = {
  [PrivacyPolicyLifecycleStatus.DRAFT]: {
    label: 'Draft',
    description: 'Editable working version — not yet submitted for governance review.',
    wasEverOperational: false,
    isTerminal: false,
    isReversible: true,
  },
  [PrivacyPolicyLifecycleStatus.IN_REVIEW]: {
    label: 'In review',
    description: 'Submitted for multi-step governance review.',
    wasEverOperational: false,
    isTerminal: false,
    isReversible: true,
  },
  [PrivacyPolicyLifecycleStatus.APPROVED]: {
    label: 'Approved',
    description: 'Governance approved — may be scheduled or activated.',
    wasEverOperational: false,
    isTerminal: false,
    isReversible: true,
  },
  [PrivacyPolicyLifecycleStatus.SCHEDULED]: {
    label: 'Scheduled',
    description: 'Approved with a future validFrom — not yet operational.',
    wasEverOperational: false,
    isTerminal: false,
    isReversible: true,
  },
  [PrivacyPolicyLifecycleStatus.ACTIVE]: {
    label: 'Active',
    description: 'Operationally effective within its validity window.',
    wasEverOperational: true,
    isTerminal: false,
    isReversible: true,
  },
  [PrivacyPolicyLifecycleStatus.SUSPENDED]: {
    label: 'Suspended',
    description: 'Temporarily blocked — was operational; may resume with permission.',
    wasEverOperational: true,
    isTerminal: false,
    isReversible: true,
  },
  [PrivacyPolicyLifecycleStatus.REJECTED]: {
    label: 'Rejected',
    description: 'Governance rejection during review — never became operational.',
    wasEverOperational: false,
    isTerminal: true,
    isReversible: false,
  },
  [PrivacyPolicyLifecycleStatus.REVOKED]: {
    label: 'Revoked',
    description: 'Explicit withdrawal after being operational — terminal, not reactivatable.',
    wasEverOperational: true,
    isTerminal: true,
    isReversible: false,
  },
  [PrivacyPolicyLifecycleStatus.EXPIRED]: {
    label: 'Expired',
    description: 'Validity window ended — was operational until expiry.',
    wasEverOperational: true,
    isTerminal: true,
    isReversible: false,
  },
  [PrivacyPolicyLifecycleStatus.SUPERSEDED]: {
    label: 'Superseded',
    description: 'Replaced by a newer version — historical record preserved.',
    wasEverOperational: true,
    isTerminal: true,
    isReversible: false,
  },
};

/** Status-specific reason codes for lifecycle transitions and system jobs. */
export const POLICY_LIFECYCLE_REASON_CODES = {
  REJECTED: {
    GOVERNANCE_REJECTION: 'POLICY_REJECTED_GOVERNANCE',
    INCOMPLETE_DOCUMENTATION: 'POLICY_REJECTED_INCOMPLETE_DOCS',
    RISK_TOO_HIGH: 'POLICY_REJECTED_RISK_TOO_HIGH',
    FOUR_EYES_VIOLATION: 'POLICY_REJECTED_FOUR_EYES',
  },
  SUSPENDED: {
    CONSENT_WITHDRAWN: 'POLICY_SUSPENDED_CONSENT_WITHDRAWN',
    INCIDENT_RESPONSE: 'POLICY_SUSPENDED_INCIDENT',
    OPERATOR_REQUEST: 'POLICY_SUSPENDED_OPERATOR',
    PENDING_INVESTIGATION: 'POLICY_SUSPENDED_INVESTIGATION',
  },
  REVOKED: {
    OPERATOR_REVOCATION: 'POLICY_REVOKED_OPERATOR',
    LEGAL_OBLIGATION: 'POLICY_REVOKED_LEGAL',
    DATA_BREACH: 'POLICY_REVOKED_BREACH',
    CONSENT_WITHDRAWN: 'POLICY_REVOKED_CONSENT',
  },
  EXPIRED: {
    VALID_UNTIL_REACHED: 'POLICY_EXPIRED_VALID_UNTIL',
    SCHEDULED_CATCH_UP: 'POLICY_EXPIRED_CATCH_UP',
  },
  SUPERSEDED: {
    NEW_VERSION_ACTIVATED: 'POLICY_SUPERSEDED_NEW_VERSION',
    EXTENSION_NEW_VERSION: 'POLICY_SUPERSEDED_EXTENSION',
  },
  RESUMED: {
    SUSPENSION_LIFTED: 'POLICY_RESUMED_SUSPENSION_LIFTED',
  },
} as const;

export const POLICY_ROLLBACK_FORBIDDEN_SOURCE_STATUSES: ReadonlySet<PrivacyPolicyLifecycleStatus> =
  new Set([
    PrivacyPolicyLifecycleStatus.REJECTED,
    PrivacyPolicyLifecycleStatus.REVOKED,
    PrivacyPolicyLifecycleStatus.SUPERSEDED,
    PrivacyPolicyLifecycleStatus.EXPIRED,
  ]);

export const POLICY_NEW_VERSION_ALLOWED_SOURCE_STATUSES: ReadonlySet<PrivacyPolicyLifecycleStatus> =
  new Set([
    PrivacyPolicyLifecycleStatus.ACTIVE,
    PrivacyPolicyLifecycleStatus.SUSPENDED,
  ]);

export const POLICY_EXTENSION_SOURCE_STATUSES: ReadonlySet<PrivacyPolicyLifecycleStatus> = new Set([
  PrivacyPolicyLifecycleStatus.ACTIVE,
]);

export type LifecycleActionKind =
  | 'request-review'
  | 'request-changes'
  | 'approve'
  | 'schedule-activation'
  | 'activate'
  | 'suspend'
  | 'revoke'
  | 'reject'
  | 'supersede'
  | 'resume'
  | 'grant'
  | 'withdraw'
  | 'authorize'
  | 'terminate'
  | 'activate-dpa';

export type LifecycleEntityKind =
  | 'processing-activity'
  | 'legal-basis'
  | 'enforcement-policy'
  | 'provider-grant'
  | 'consent'
  | 'sharing'
  | 'dpa'
  | 'legacy-authorization';

export interface LifecycleActionDefinition {
  kind: LifecycleActionKind;
  labelKey: string;
  descriptionKey: string;
  impactKey?: string;
  requiresReason: boolean;
  requiresScheduleDate?: boolean;
  tone: 'default' | 'critical' | 'watch';
  permission: 'write' | 'manage';
  separatesFrom?: LifecycleActionKind;
}

export const LIFECYCLE_ACTION_MATRIX: Record<LifecycleActionKind, LifecycleActionDefinition> = {
  'request-review': {
    kind: 'request-review',
    labelKey: 'dataProcessing.lifecycle.requestReview',
    descriptionKey: 'dataProcessing.lifecycle.requestReviewDesc',
    impactKey: 'dataProcessing.lifecycle.requestReviewImpact',
    requiresReason: false,
    tone: 'default',
    permission: 'write',
  },
  'request-changes': {
    kind: 'request-changes',
    labelKey: 'dataProcessing.lifecycle.requestChanges',
    descriptionKey: 'dataProcessing.lifecycle.requestChangesDesc',
    requiresReason: true,
    tone: 'watch',
    permission: 'manage',
  },
  approve: {
    kind: 'approve',
    labelKey: 'dataProcessing.lifecycle.approve',
    descriptionKey: 'dataProcessing.lifecycle.approveDesc',
    impactKey: 'dataProcessing.lifecycle.fourEyesImpact',
    requiresReason: false,
    tone: 'default',
    permission: 'manage',
  },
  'schedule-activation': {
    kind: 'schedule-activation',
    labelKey: 'dataProcessing.lifecycle.scheduleActivation',
    descriptionKey: 'dataProcessing.lifecycle.scheduleActivationDesc',
    requiresReason: false,
    requiresScheduleDate: true,
    tone: 'default',
    permission: 'manage',
  },
  activate: {
    kind: 'activate',
    labelKey: 'dataProcessing.lifecycle.activate',
    descriptionKey: 'dataProcessing.lifecycle.activateDesc',
    impactKey: 'dataProcessing.lifecycle.activateImpact',
    requiresReason: false,
    tone: 'default',
    permission: 'manage',
  },
  suspend: {
    kind: 'suspend',
    labelKey: 'dataProcessing.lifecycle.suspend',
    descriptionKey: 'dataProcessing.lifecycle.suspendDesc',
    impactKey: 'dataProcessing.lifecycle.suspendImpact',
    requiresReason: true,
    tone: 'watch',
    permission: 'manage',
  },
  revoke: {
    kind: 'revoke',
    labelKey: 'dataProcessing.lifecycle.revoke',
    descriptionKey: 'dataProcessing.lifecycle.revokeDesc',
    impactKey: 'dataProcessing.lifecycle.revokeImpact',
    requiresReason: true,
    tone: 'critical',
    permission: 'manage',
    separatesFrom: 'reject',
  },
  reject: {
    kind: 'reject',
    labelKey: 'dataProcessing.lifecycle.reject',
    descriptionKey: 'dataProcessing.lifecycle.rejectDesc',
    impactKey: 'dataProcessing.lifecycle.rejectImpact',
    requiresReason: true,
    tone: 'critical',
    permission: 'manage',
    separatesFrom: 'revoke',
  },
  supersede: {
    kind: 'supersede',
    labelKey: 'dataProcessing.lifecycle.supersede',
    descriptionKey: 'dataProcessing.lifecycle.supersedeDesc',
    impactKey: 'dataProcessing.lifecycle.supersedeImpact',
    requiresReason: false,
    tone: 'default',
    permission: 'manage',
  },
  resume: {
    kind: 'resume',
    labelKey: 'dataProcessing.lifecycle.resume',
    descriptionKey: 'dataProcessing.lifecycle.resumeDesc',
    requiresReason: false,
    tone: 'default',
    permission: 'manage',
  },
  grant: {
    kind: 'grant',
    labelKey: 'dataProcessing.lifecycle.grant',
    descriptionKey: 'dataProcessing.lifecycle.grantDesc',
    requiresReason: false,
    tone: 'default',
    permission: 'write',
  },
  withdraw: {
    kind: 'withdraw',
    labelKey: 'dataProcessing.lifecycle.withdraw',
    descriptionKey: 'dataProcessing.lifecycle.withdrawDesc',
    requiresReason: true,
    tone: 'critical',
    permission: 'write',
  },
  authorize: {
    kind: 'authorize',
    labelKey: 'dataProcessing.lifecycle.authorize',
    descriptionKey: 'dataProcessing.lifecycle.authorizeDesc',
    requiresReason: false,
    tone: 'default',
    permission: 'manage',
  },
  terminate: {
    kind: 'terminate',
    labelKey: 'dataProcessing.lifecycle.terminate',
    descriptionKey: 'dataProcessing.lifecycle.terminateDesc',
    requiresReason: true,
    tone: 'critical',
    permission: 'manage',
  },
  'activate-dpa': {
    kind: 'activate-dpa',
    labelKey: 'dataProcessing.lifecycle.activateDpa',
    descriptionKey: 'dataProcessing.lifecycle.activateDpaDesc',
    requiresReason: false,
    tone: 'default',
    permission: 'manage',
  },
};

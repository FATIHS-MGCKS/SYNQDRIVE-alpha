import type { LifecycleActionKind, LifecycleEntityKind } from './data-processing-lifecycle.types';
import { LIFECYCLE_ACTION_MATRIX } from './data-processing-lifecycle.types';

type PermissionCheck = (module: string, level: 'read' | 'write' | 'manage') => boolean;

export function canRunLifecycleAction(
  hasPermission: PermissionCheck,
  action: LifecycleActionKind,
): boolean {
  const def = LIFECYCLE_ACTION_MATRIX[action];
  return hasPermission('data-authorization', def.permission);
}

export function availableLifecycleActions(input: {
  entityKind: LifecycleEntityKind;
  status: string;
  isCurrentVersion: boolean;
  isTerminal?: boolean;
  hasPermission: PermissionCheck;
}): LifecycleActionKind[] {
  const { entityKind, status, isCurrentVersion, isTerminal, hasPermission } = input;
  const actions: LifecycleActionKind[] = [];

  const allow = (action: LifecycleActionKind) => {
    if (canRunLifecycleAction(hasPermission, action)) actions.push(action);
  };

  if (entityKind === 'processing-activity') {
    if (status === 'DRAFT') allow('request-review');
    if (status === 'IN_REVIEW') {
      allow('approve');
      allow('reject');
      allow('request-changes');
    }
    if (status === 'APPROVED' || status === 'SCHEDULED') {
      allow('schedule-activation');
      allow('activate');
    }
    if (status === 'ACTIVE') {
      allow('suspend');
      allow('revoke');
    }
    if (status === 'SUSPENDED') allow('resume');
    if (!isCurrentVersion || isTerminal) {
      // historical — read only
    } else if (status !== 'DRAFT' && status !== 'IN_REVIEW') {
      allow('supersede');
    }
    if (['REVOKED', 'REJECTED', 'EXPIRED'].includes(status)) {
      return actions.filter((a) => a === 'supersede');
    }
  }

  if (entityKind === 'dpa') {
    if (status === 'DRAFT') allow('activate-dpa');
    if (status === 'ACTIVE') allow('terminate');
    if (isCurrentVersion && status !== 'DRAFT') allow('supersede');
  }

  if (entityKind === 'provider-grant') {
    if (status === 'PENDING') allow('activate');
    if (status === 'ACTIVE') allow('revoke');
  }

  if (entityKind === 'consent') {
    if (status === 'PENDING' || status === 'RECORDED') allow('grant');
    if (status === 'GRANTED') allow('withdraw');
  }

  if (entityKind === 'sharing') {
    if (status === 'DRAFT' || status === 'PENDING') allow('authorize');
    if (status === 'AUTHORIZED' || status === 'ACTIVE') allow('revoke');
  }

  if (entityKind === 'legacy-authorization') {
    if (status === 'PENDING') {
      allow('approve');
      allow('reject');
    }
    if (status === 'ACTIVE') allow('revoke');
  }

  return [...new Set(actions)];
}

export function isRecordEditable(status: string, isCurrentVersion: boolean): boolean {
  return isCurrentVersion && status === 'DRAFT';
}

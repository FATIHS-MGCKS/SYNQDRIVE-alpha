export const masterOrganizationsNl = {
  'master.organizations.create.success':
    'Organization “{{name}}” created{{adminSuffix}}.',
  'master.organizations.create.successWithAdmin': ' with admin account',
  'master.organizations.create.failed': 'Could not create organization.',
  'master.organizations.create.successRefreshFailed':
    'Organization was created, but the operational list could not be refreshed: {{error}}',
  'master.organizations.update.success': 'Organization updated.',
  'master.organizations.update.failed': 'Could not update organization.',
  'master.organizations.lifecycle.title': 'Organization status',
  'master.organizations.lifecycle.current': 'Current status',
  'master.organizations.lifecycle.activate': 'Activate organization',
  'master.organizations.lifecycle.suspend': 'Suspend organization',
  'master.organizations.lifecycle.reactivate': 'Reactivate organization',
  'master.organizations.lifecycle.activateHint':
    'Moves the tenant from pending to active operational state.',
  'master.organizations.lifecycle.suspendHint':
    'Blocks tenant operational APIs until reactivated; billing attention may still apply.',
  'master.organizations.lifecycle.reactivateHint':
    'Restores tenant operational access when policy allows.',
  'master.organizations.lifecycle.suspendConfirmTitle': 'Suspend organization?',
  'master.organizations.lifecycle.suspendConfirmBody':
    'Tenant users lose operational access until the organization is reactivated. Confirm only if intended.',
  'master.organizations.lifecycle.archivedNote':
    'Archived organizations cannot be changed here. Retention-aware offboarding is not available yet.',
  'master.organizations.offboarding.title': 'Permanent deletion unavailable',
  'master.organizations.offboarding.body':
    'Hard delete is blocked by platform policy until compliant organization offboarding exists. Contact platform operations if retention offboarding is required.',
  'master.organizations.mfa.stepUpSuccessRetry': '2FA confirmed — retrying your request…',
  'master.organizations.mfa.stepUpSuccessManual': '2FA confirmed — please run the action again.',
  'master.organizations.mfa.retryFailed': 'Retry after 2FA failed: {{error}}',
  'master.organizations.mfa.enrollmentRequired':
    'MFA enrollment is required before this action.',
};
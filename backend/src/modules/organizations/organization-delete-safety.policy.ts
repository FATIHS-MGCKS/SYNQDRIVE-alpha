import { organizationHardDeleteDisabledException } from './organization-delete-safety.errors';

/**
 * Master Admin organization hard-delete is disabled until an approved
 * retention-aware offboarding workflow replaces prisma.organization.delete cascades.
 */
export function assertOrganizationHardDeleteAllowed(): void {
  throw organizationHardDeleteDisabledException();
}
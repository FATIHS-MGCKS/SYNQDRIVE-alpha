import { getStoredUser, isAuthenticated, isMasterAdmin, type AuthUser } from '../../lib/auth';
import {
  OPERATOR_ALLOWED_MEMBERSHIP_ROLES,
  OPERATOR_DENIED_MEMBERSHIP_ROLES,
  type OperatorAccessDenialReason,
  type OperatorAccessEvaluation,
} from './operatorAccess.types';

const ALLOWED = new Set<string>(OPERATOR_ALLOWED_MEMBERSHIP_ROLES);
const DENIED = new Set<string>(OPERATOR_DENIED_MEMBERSHIP_ROLES);

function normalizeMembershipRole(user: AuthUser | null): string {
  return user?.membershipRole?.toUpperCase().trim() ?? '';
}

/**
 * Defensive gate for the Operator entry point.
 * MASTER_ADMIN always; rental staff roles only (excludes DRIVER / unknown roles).
 * Security enforcement remains on backend — this is UX + routing defense.
 */
export function evaluateOperatorAccess(user: AuthUser | null = getStoredUser()): OperatorAccessEvaluation {
  if (!user || !isAuthenticated()) {
    return { allowed: false, reason: 'unauthenticated' };
  }
  if (isMasterAdmin()) {
    return { allowed: true };
  }
  const role = normalizeMembershipRole(user);
  if (!role) {
    return { allowed: false, reason: 'forbidden_role' };
  }
  if (DENIED.has(role)) {
    return { allowed: false, reason: 'forbidden_role' };
  }
  if (!ALLOWED.has(role)) {
    return { allowed: false, reason: 'forbidden_role' };
  }
  return { allowed: true };
}

export function canAccessOperatorApp(): boolean {
  return evaluateOperatorAccess().allowed;
}

export function operatorAccessDenialMessage(reason: OperatorAccessDenialReason): {
  title: string;
  description: string;
} {
  switch (reason) {
    case 'unauthenticated':
      return {
        title: 'Anmeldung erforderlich',
        description: 'Melde dich an, um die Operator App zu nutzen.',
      };
    case 'forbidden_role':
      return {
        title: 'Keine Berechtigung',
        description: 'Du hast keine Berechtigung für die Operator App.',
      };
    case 'no_organization':
      return {
        title: 'Keine Organisation ausgewählt',
        description: 'Wähle eine Miet-Organisation in der SynqDrive App oder melde dich mit einem Organisationskonto an.',
      };
    case 'no_rental_product':
      return {
        title: 'Kein Mietprodukt',
        description: 'Diese Organisation ist nicht für den Mietbetrieb (Rental) freigeschaltet.',
      };
    default:
      return {
        title: 'Zugriff nicht möglich',
        description: 'Die Operator App ist für dieses Konto nicht verfügbar.',
      };
  }
}

export function isRentalBusinessType(businessType: string | null | undefined): boolean {
  return (businessType ?? '').trim().toUpperCase() === 'RENTAL';
}

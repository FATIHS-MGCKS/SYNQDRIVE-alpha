import { getStoredUser, isAuthenticated, isMasterAdmin, type AuthUser } from '../../lib/auth';
import {
  type OperatorAccessDenialReason,
  type OperatorAccessEvaluation,
} from './operatorAccess.types';
import { canPerformOperatorAction } from './operatorPermissions';

/**
 * Defensive gate for the Operator entry point.
 * Requires `operator.app.access` (operator-app.read). MASTER_ADMIN always allowed.
 * Security enforcement remains on backend — this is UX + routing defense only.
 */
export function evaluateOperatorAccess(user: AuthUser | null = getStoredUser()): OperatorAccessEvaluation {
  if (!user || !isAuthenticated()) {
    return { allowed: false, reason: 'unauthenticated' };
  }
  if (isMasterAdmin()) {
    return { allowed: true };
  }
  if (!canPerformOperatorAction(user, 'operator.app.access')) {
    return { allowed: false, reason: 'forbidden_permission' };
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
    case 'forbidden_permission':
      return {
        title: 'Operator-Zugriff nicht freigeschaltet',
        description:
          'Dein Konto hat keine Operator-App-Berechtigung (operator-app). Bitte wende dich an einen Administrator.',
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

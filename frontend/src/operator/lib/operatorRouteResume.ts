import type { OperatorBookingContextDto } from './operatorData.types';
import type { HandoverDraftViewResponse } from '../handover/operatorHandoverDraft.types';
import { isUuidLike } from './operatorRoutes';

export type OperatorRouteResumeErrorCode =
  | 'invalid-id'
  | 'not-found'
  | 'forbidden'
  | 'finalized'
  | 'draft-cancelled'
  | 'not-allowed';

export interface OperatorRouteResumeError {
  code: OperatorRouteResumeErrorCode;
  title: string;
  message: string;
}

export function assertOperatorRouteId(
  value: string | undefined,
  label: string,
): OperatorRouteResumeError | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed || !isUuidLike(trimmed)) {
    return {
      code: 'invalid-id',
      title: 'Ungültiger Link',
      message: `${label} ist ungültig oder fehlt.`,
    };
  }
  return null;
}

export function evaluateHandoverResume(
  ctx: OperatorBookingContextDto,
  kind: 'PICKUP' | 'RETURN',
): OperatorRouteResumeError | null {
  if (kind === 'PICKUP') {
    if (ctx.handover.hasPickupProtocol && !ctx.canStartPickup) {
      return {
        code: 'finalized',
        title: 'Übergabe abgeschlossen',
        message: 'Die Fahrzeugübergabe ist bereits abgeschlossen.',
      };
    }
    if (!ctx.canStartPickup) {
      return {
        code: 'not-allowed',
        title: 'Übergabe nicht möglich',
        message: 'Diese Buchung kann derzeit nicht übergeben werden.',
      };
    }
    return null;
  }

  if (ctx.handover.hasReturnProtocol && !ctx.canStartReturn) {
    return {
      code: 'finalized',
      title: 'Rückgabe abgeschlossen',
      message: 'Die Fahrzeugrückgabe ist bereits abgeschlossen.',
    };
  }
  if (!ctx.canStartReturn) {
    return {
      code: 'not-allowed',
      title: 'Rückgabe nicht möglich',
      message: 'Diese Buchung kann derzeit nicht zurückgenommen werden.',
    };
  }
  return null;
}

export function evaluateDraftResume(view: HandoverDraftViewResponse): OperatorRouteResumeError | null {
  if (!view.draft) {
    return {
      code: 'draft-cancelled',
      title: 'Entwurf nicht verfügbar',
      message: 'Der Übergabe-Entwurf wurde abgebrochen oder ist abgelaufen.',
    };
  }
  if (view.draft.expired) {
    return {
      code: 'draft-cancelled',
      title: 'Entwurf abgelaufen',
      message: 'Der Übergabe-Entwurf ist abgelaufen und kann nicht fortgesetzt werden.',
    };
  }
  if (!view.draft.editable) {
    return {
      code: 'finalized',
      title: 'Vorgang abgeschlossen',
      message: 'Dieser Übergabe-Vorgang ist bereits abgeschlossen.',
    };
  }
  return null;
}

export function mapHttpStatusToRouteError(
  status: number,
  fallbackTitle: string,
): OperatorRouteResumeError {
  if (status === 403) {
    return {
      code: 'forbidden',
      title: 'Kein Zugriff',
      message: 'Diese Ressource gehört nicht zu Ihrer Organisation.',
    };
  }
  if (status === 404) {
    return {
      code: 'not-found',
      title: 'Nicht gefunden',
      message: 'Die angeforderte Ressource wurde nicht gefunden.',
    };
  }
  return {
    code: 'not-found',
    title: fallbackTitle,
    message: 'Der Vorgang konnte nicht geladen werden.',
  };
}

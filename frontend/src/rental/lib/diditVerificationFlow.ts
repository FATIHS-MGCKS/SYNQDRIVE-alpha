import type {
  DiditSdkState,
  VerificationResult,
  VerificationResultType,
} from '@didit-protocol/sdk-web';
import { DiditSdk } from '@didit-protocol/sdk-web';
import { api } from '../../lib/api';
import type { CustomerVerificationCheckKind } from './customer-verification';

export type DiditSdkCompleteStatus = VerificationResultType;

const DIDIT_POPUP_NAME = 'synqdrive-didit-verification';
const DIDIT_POPUP_FEATURES = 'popup=yes,width=520,height=760,menubar=no,toolbar=no,location=yes,status=no,resizable=yes,scrollbars=yes';
const POPUP_POLL_MS = 500;
const POPUP_TIMEOUT_MS = 30 * 60 * 1000;

export class DiditVerificationFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiditVerificationFlowError';
  }
}

function mapDiditFailureMessage(result: VerificationResult): string {
  if (result.type === 'cancelled') {
    return 'Didit-Prüfung abgebrochen.';
  }
  return result.error?.message ?? 'Didit-Prüfung konnte nicht gestartet werden.';
}

function waitForPopupClose(popup: Window): Promise<'closed' | 'timeout'> {
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const tick = () => {
      if (popup.closed) {
        resolve('closed');
        return;
      }
      if (Date.now() - startedAt > POPUP_TIMEOUT_MS) {
        try {
          popup.close();
        } catch {
          // ignore
        }
        resolve('timeout');
        return;
      }
      window.setTimeout(tick, POPUP_POLL_MS);
    };
    tick();
  });
}

async function startDiditSdkModal(
  url: string,
  onComplete: (status: DiditSdkCompleteStatus) => void | Promise<void>,
): Promise<void> {
  const sdk = DiditSdk.shared;

  const cleanup = () => {
    sdk.onComplete = undefined;
    sdk.onStateChange = undefined;
  };

  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    sdk.onStateChange = (state: DiditSdkState, error?: string) => {
      if (state !== 'error') return;
      sdk.close();
      finish(() =>
        reject(
          new DiditVerificationFlowError(
            error ?? 'Didit-Prüfung konnte nicht geladen werden.',
          ),
        ),
      );
    };

    sdk.onComplete = (result) => {
      if (result.type === 'failed') {
        sdk.close();
        finish(() => reject(new DiditVerificationFlowError(mapDiditFailureMessage(result))));
        return;
      }

      finish(() => {
        void onComplete(result.type);
        resolve();
      });
    };

    void sdk
      .startVerification({
        url,
        configuration: {
          loggingEnabled: import.meta.env.DEV,
          closeModalOnComplete: true,
          zIndex: 99999,
        },
      })
      .catch((error: unknown) => {
        sdk.close();
        finish(() =>
          reject(
            error instanceof Error
              ? error
              : new DiditVerificationFlowError('Didit-Prüfung konnte nicht gestartet werden.'),
          ),
        );
      });
  });
}

export async function startDiditVerificationSession(
  customerId: string,
  bookingId: string | undefined,
  kind: CustomerVerificationCheckKind,
  onComplete: (status: DiditSdkCompleteStatus) => void | Promise<void>,
): Promise<void> {
  const session = await api.customerVerification.startDiditSession(
    customerId,
    bookingId,
    kind,
  );

  if (!session.url?.trim()) {
    throw new DiditVerificationFlowError(
      'Didit-Sitzung ohne gültige URL — bitte erneut versuchen.',
    );
  }

  const popup = window.open(session.url, DIDIT_POPUP_NAME, DIDIT_POPUP_FEATURES);
  if (!popup) {
    await startDiditSdkModal(session.url, onComplete);
    return;
  }

  try {
    popup.focus();
  } catch {
    // ignore
  }

  const outcome = await waitForPopupClose(popup);
  if (outcome === 'timeout') {
    throw new DiditVerificationFlowError(
      'Didit-Prüfung wurde wegen Zeitüberschreitung geschlossen.',
    );
  }

  await onComplete('completed');
}

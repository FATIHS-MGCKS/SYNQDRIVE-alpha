import type {
  DiditSdkState,
  VerificationResult,
  VerificationResultType,
} from '@didit-protocol/sdk-web';
import { DiditSdk } from '@didit-protocol/sdk-web';
import { api } from '../../lib/api';
import type { CustomerVerificationCheckKind } from './customer-verification';

export type DiditSdkCompleteStatus = VerificationResultType;

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
        url: session.url,
        configuration: {
          loggingEnabled: import.meta.env.DEV,
          closeModalOnComplete: true,
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

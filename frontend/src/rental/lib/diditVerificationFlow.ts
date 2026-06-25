import type { VerificationResultType } from '@didit-protocol/sdk-web';
import { DiditSdk } from '@didit-protocol/sdk-web';
import { api } from '../../lib/api';
import type { CustomerVerificationCheckKind } from './customer-verification';

export type DiditSdkCompleteStatus = VerificationResultType;

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

  DiditSdk.shared.onComplete = (result) => {
    void onComplete(result.type);
  };

  DiditSdk.shared.startVerification({ url: session.url });
}
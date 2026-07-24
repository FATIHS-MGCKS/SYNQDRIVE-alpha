import type { HandoverProtocolDto } from './handover.types';

/** List/summary surfaces must not expose signature bitmaps or signer names. */
export type HandoverProtocolListSummary = Omit<
  HandoverProtocolDto,
  | 'customerSignatureName'
  | 'customerSignatureDataUrl'
  | 'staffSignatureName'
  | 'staffSignatureDataUrl'
> & {
  hasCustomerSignature: boolean;
  hasStaffSignature: boolean;
};

export function redactHandoverProtocolForList(
  protocol: HandoverProtocolDto | null,
): HandoverProtocolListSummary | null {
  if (!protocol) return null;
  const {
    customerSignatureName: _cn,
    customerSignatureDataUrl: _cd,
    staffSignatureName: _sn,
    staffSignatureDataUrl: _sd,
    ...rest
  } = protocol;
  return {
    ...rest,
    hasCustomerSignature: Boolean(_cd?.trim() || _cn?.trim()),
    hasStaffSignature: Boolean(_sd?.trim() || _sn?.trim()),
  };
}

import { InvoiceExternalSendChannel } from '@prisma/client';

const CHANNEL_LABELS: Record<InvoiceExternalSendChannel, string> = {
  EXTERNAL_EMAIL: 'Externe E-Mail',
  POSTAL_MAIL: 'Postversand',
  IN_PERSON: 'Persönliche Übergabe',
  CUSTOMER_PORTAL: 'Kundenportal',
  OTHER: 'Sonstiger Kanal',
};

export function externalSendChannelLabel(
  channel: InvoiceExternalSendChannel | string,
): string {
  return CHANNEL_LABELS[channel as InvoiceExternalSendChannel] ?? String(channel);
}

export const INVOICE_SEND_SOURCE_EXTERNAL = 'EXTERNAL_RECORDED' as const;
export const INVOICE_SEND_SOURCE_SYNQDRIVE = 'SYNQDRIVE_OUTBOUND_EMAIL' as const;

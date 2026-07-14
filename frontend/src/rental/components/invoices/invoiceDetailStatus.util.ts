import type { StatusTone } from '../../../components/patterns/status-utils';

const STATUS_TONE: Record<string, StatusTone> = {
  DRAFT: 'neutral',
  ISSUED: 'info',
  SENT: 'info',
  PARTIALLY_PAID: 'watch',
  PAID: 'success',
  OVERDUE: 'critical',
  CANCELLED: 'neutral',
  CREDITED: 'neutral',
  VOID: 'neutral',
  UPLOADED: 'info',
  NEEDS_REVIEW: 'watch',
  APPROVED: 'success',
  BOOKED: 'info',
  REJECTED: 'critical',
};

export function invoiceStatusTone(status: string): StatusTone {
  return STATUS_TONE[status] ?? 'neutral';
}

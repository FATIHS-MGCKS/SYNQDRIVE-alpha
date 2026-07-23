export type BookingTimelineItemKind =
  | 'ACTIVITY'
  | 'TASK'
  | 'HANDOVER'
  | 'ELIGIBILITY'
  | 'PAYMENT';

export interface BookingTimelineItemDto {
  id: string;
  kind: BookingTimelineItemKind;
  title: string;
  description: string | null;
  occurredAt: string;
  status: string | null;
}

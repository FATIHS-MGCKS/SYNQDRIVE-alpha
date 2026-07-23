export interface BookingAuditEntryDto {
  id: string;
  action: string;
  description: string;
  createdAt: string;
  actorName: string | null;
}

export interface BookingAuditDto {
  items: BookingAuditEntryDto[];
}

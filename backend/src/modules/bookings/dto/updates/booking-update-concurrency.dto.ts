import { IsBoolean, IsISO8601, IsOptional } from 'class-validator';

/** Optimistic concurrency — client must send the `updatedAt` from last read. */
export class BookingUpdateConcurrencyDto {
  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string;

  /**
   * When true and caller holds `booking.override`, terminal bookings may be
   * mutated beyond notes-only (schedule/vehicle/customer/etc.).
   */
  @IsOptional()
  @IsBoolean()
  allowTerminalOverride?: boolean;
}

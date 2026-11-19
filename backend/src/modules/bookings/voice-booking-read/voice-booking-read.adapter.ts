import { Injectable } from '@nestjs/common';
import { BookingsService } from '../bookings.service';
import type {
  VoiceBookingDetailRead,
  VoiceBookingListQuery,
  VoiceBookingListResult,
  VoiceBookingReadPort,
} from '@modules/voice-mcp-gateway/ports/voice-booking-read.port';
import {
  mapBookingDetailToVoiceRead,
  mapBookingListRowToVoiceRead,
} from './voice-booking-read.mapper';

@Injectable()
export class VoiceBookingReadAdapter implements VoiceBookingReadPort {
  constructor(private readonly bookingsService: BookingsService) {}

  async searchBookings(
    organizationId: string,
    query: VoiceBookingListQuery,
  ): Promise<VoiceBookingListResult> {
    const result = await this.bookingsService.findAll(organizationId, query as never);
    const rows = Array.isArray(result.data) ? result.data : [];
    return {
      data: rows.map((row) => mapBookingListRowToVoiceRead(row as never)),
      total: result.meta?.total ?? rows.length,
    };
  }

  async getBookingById(
    organizationId: string,
    bookingId: string,
  ): Promise<VoiceBookingDetailRead | null> {
    const detail = await this.bookingsService.findById(organizationId, bookingId);
    if (!detail) {
      return null;
    }
    return mapBookingDetailToVoiceRead(detail as never);
  }
}
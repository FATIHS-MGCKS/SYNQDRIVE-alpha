/** @deprecated Import from `./dto/response` instead. */
export type {
  BookingDetailDto,
  BookingDetailDocumentSlotDto,
  BookingStationContextDto,
  BookingDetailCustomerDto,
  BookingDetailVehicleDto,
  BookingTaskSummaryItemDto,
} from './dto/response/booking-detail.dto';

export type {
  BookingPaymentCardSectionDto as BookingPaymentCardSection,
  BookingPaymentCardRequestItemDto as BookingPaymentCardRequestItem,
} from './dto/response/booking-payment-card-section.dto';

export type { BookingHandoverSideDto as HandoverSideSummary } from './dto/response/booking-handover.dto';

export type { BookingTaskSummaryItemDto as TaskSummaryItem } from './dto/response/booking-detail.dto';

export type { BookingAuditEntryDto as ActivityItem } from './dto/response/booking-audit.dto';

export type {
  BookingListItemDto,
  BookingCalendarItemDto,
  BookingTimelineItemDto,
  BookingFinanceDto,
  BookingHandoverDto,
  BookingAuditDto,
} from './dto/response';

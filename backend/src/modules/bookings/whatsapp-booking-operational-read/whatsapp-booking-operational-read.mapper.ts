import type { BookingDetailDto } from '../booking-detail.types';
import type { WhatsAppBookingOperationalRead } from '@modules/whatsapp/ports/whatsapp-booking-operational-read.port';

export function mapBookingDetailToWhatsAppOperationalRead(
  detail: BookingDetailDto,
): WhatsAppBookingOperationalRead {
  const pickup = detail.stations.pickup;
  const ret = detail.stations.return;

  return {
    core: {
      bookingId: detail.core.bookingId,
      bookingNumber: detail.core.bookingNumber,
      status: detail.core.status,
      statusEnum: detail.core.statusEnum,
      startDate: detail.core.startDate,
      endDate: detail.core.endDate,
      pickupStationName: detail.core.pickupStationName,
      returnStationName: detail.core.returnStationName,
    },
    vehicle: detail.vehicle?.vehicleId
      ? {
          vehicleId: detail.vehicle.vehicleId,
          displayName: detail.vehicle.displayName,
        }
      : null,
    stations: {
      pickup: pickup
        ? {
            stationId: pickup.stationId,
            name: pickup.name,
            address: pickup.address,
            handoverInstructions: pickup.handoverInstructions,
            returnInstructions: pickup.returnInstructions,
          }
        : null,
      return: ret
        ? {
            stationId: ret.stationId,
            name: ret.name,
            address: ret.address,
            handoverInstructions: ret.handoverInstructions,
            returnInstructions: ret.returnInstructions,
          }
        : null,
    },
    finance: {
      depositStatus: detail.finance.depositStatus,
      paymentStatus: detail.finance.paymentStatus,
      depositAmountCents: detail.finance.depositAmountCents,
      openAmountCents: detail.finance.openAmountCents,
    },
    customer: {
      customerId: detail.customer.customerId,
      fullName: detail.customer.fullName,
      phone: detail.customer.phone,
      openInvoiceCount: detail.customer.openInvoiceCount,
    },
    documents: {
      bundleStatus: detail.documents.bundleStatus,
      legalMissing: detail.documents.legalMissing,
      warnings: detail.documents.warnings,
      slots: detail.documents.slots.map((s) => ({
        documentType: s.documentType,
        status: s.status,
      })),
    },
    tasks: {
      openCount: detail.tasks.openCount,
      overdueCount: detail.tasks.overdueCount,
      items: detail.tasks.items.slice(0, 5).map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueAt: t.dueAt,
      })),
    },
    handover: {
      pickup: detail.handover.pickup
        ? { completedAt: detail.handover.pickup.completedAt }
        : null,
      return: detail.handover.return
        ? { completedAt: detail.handover.return.completedAt }
        : null,
    },
  };
}
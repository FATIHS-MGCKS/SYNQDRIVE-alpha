import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { BookingsService } from '@modules/bookings/bookings.service';
import { BookingDocumentBundleService } from '@modules/documents/booking-document-bundle.service';
import { VehiclesService } from '@modules/vehicles/vehicles.service';
import { DamagesService } from '@modules/vehicle-intelligence/damages/damages.service';
import { TasksService } from '@modules/tasks/tasks.service';
import type { WhatsAppAiContextSnapshot, WhatsAppAiToolName, WhatsAppAiToolResult } from './whatsapp-ai.types';

// Vehicle intelligence only (VehiclesService GPS/DTC) — never DIMO Agent / ChatService as WhatsApp sender.
const STALE_GPS_MS = 2 * 60 * 60 * 1000;

@Injectable()
export class WhatsAppAiToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly documentBundle: BookingDocumentBundleService,
    private readonly vehicles: VehiclesService,
    private readonly damages: DamagesService,
    private readonly tasks: TasksService,
  ) {}

  async getBookingSummary(
    orgId: string,
    ctx: WhatsAppAiContextSnapshot,
  ): Promise<WhatsAppAiToolResult> {
    if (!ctx.booking) {
      return { tool: 'getBookingSummary', ok: false, summary: 'Keine Buchung verknüpft' };
    }
    const detail = await this.bookings.findDetail(orgId, ctx.booking.id);
    if (!detail) {
      return { tool: 'getBookingSummary', ok: false, summary: 'Buchung nicht gefunden' };
    }
    const lines = [
      `Buchung ${detail.core.bookingNumber}`,
      `Status: ${detail.core.status}`,
      `Zeitraum: ${formatDate(detail.core.startDate)} – ${formatDate(detail.core.endDate)}`,
    ];
    if (detail.core.pickupStationName) lines.push(`Abholung: ${detail.core.pickupStationName}`);
    if (detail.vehicle?.displayName) lines.push(`Fahrzeug: ${detail.vehicle.displayName}`);
    return {
      tool: 'getBookingSummary',
      ok: true,
      summary: lines.join('. '),
      data: { bookingId: ctx.booking.id },
    };
  }

  async getPickupInstructions(
    orgId: string,
    ctx: WhatsAppAiContextSnapshot,
  ): Promise<WhatsAppAiToolResult> {
    if (!ctx.booking) {
      return { tool: 'getPickupInstructions', ok: false, summary: 'Keine Buchung verknüpft' };
    }
    const detail = await this.bookings.findDetail(orgId, ctx.booking.id);
    const station = detail?.stations.pickup;
    if (!station) {
      return {
        tool: 'getPickupInstructions',
        ok: false,
        summary: 'Keine Abholstation hinterlegt',
      };
    }
    const parts = [`Abholung an Station ${station.name}`];
    if (station.address) parts.push(station.address);
    if (station.handoverInstructions) parts.push(station.handoverInstructions);
    return {
      tool: 'getPickupInstructions',
      ok: true,
      summary: parts.join('. '),
      data: { stationId: station.stationId },
    };
  }

  async getReturnInstructions(
    orgId: string,
    ctx: WhatsAppAiContextSnapshot,
  ): Promise<WhatsAppAiToolResult> {
    if (!ctx.booking) {
      return { tool: 'getReturnInstructions', ok: false, summary: 'Keine Buchung verknüpft' };
    }
    const detail = await this.bookings.findDetail(orgId, ctx.booking.id);
    const station = detail?.stations.return ?? detail?.stations.pickup;
    if (!station) {
      return { tool: 'getReturnInstructions', ok: false, summary: 'Keine Rückgabestation hinterlegt' };
    }
    const parts = [`Rückgabe an Station ${station.name}`];
    if (station.address) parts.push(station.address);
    if (station.returnInstructions) parts.push(station.returnInstructions);
    return {
      tool: 'getReturnInstructions',
      ok: true,
      summary: parts.join('. '),
      data: { stationId: station.stationId },
    };
  }

  async getMissingDocuments(
    orgId: string,
    ctx: WhatsAppAiContextSnapshot,
  ): Promise<WhatsAppAiToolResult> {
    if (!ctx.booking) {
      return { tool: 'getMissingDocuments', ok: false, summary: 'Keine Buchung verknüpft' };
    }
    const bundle = await this.documentBundle.getBundleView(orgId, ctx.booking.id);
    const missing = bundle.missingLegalDocuments.length + bundle.warnings.length;
    if (missing === 0 && bundle.legal.missing.length === 0) {
      return {
        tool: 'getMissingDocuments',
        ok: true,
        summary: 'Alle erforderlichen Dokumente sind vorhanden oder generiert.',
        data: { missingCount: 0 },
      };
    }
    const labels = [...bundle.missingLegalDocuments, ...bundle.legal.missing];
    return {
      tool: 'getMissingDocuments',
      ok: true,
      summary:
        labels.length > 0
          ? `Fehlende Dokumente: ${labels.join(', ')}`
          : `${bundle.warnings.length} Hinweis(e) im Dokumentenpaket`,
      data: { missing: labels, warnings: bundle.warnings },
    };
  }

  async getPaymentDepositStatus(
    orgId: string,
    ctx: WhatsAppAiContextSnapshot,
  ): Promise<WhatsAppAiToolResult> {
    if (!ctx.booking) {
      return { tool: 'getPaymentDepositStatus', ok: false, summary: 'Keine Buchung verknüpft' };
    }
    const detail = await this.bookings.findDetail(orgId, ctx.booking.id);
    const finance = detail?.finance;
    if (!finance) {
      return { tool: 'getPaymentDepositStatus', ok: false, summary: 'Keine Zahlungsdaten verfügbar' };
    }
    const parts: string[] = [];
    if (finance.depositStatus) parts.push(`Kaution: ${finance.depositStatus}`);
    if (finance.paymentStatus) parts.push(`Zahlung: ${finance.paymentStatus}`);
    if (detail.customer.openInvoiceCount > 0) {
      parts.push(`${detail.customer.openInvoiceCount} offene Rechnung(en)`);
    }
    return {
      tool: 'getPaymentDepositStatus',
      ok: parts.length > 0,
      summary: parts.length > 0 ? parts.join('. ') : 'Keine Zahlungsdetails hinterlegt',
      data: { finance },
    };
  }

  /** DIMO telemetry via VehiclesService — not DIMO Agent chat */
  async getVehicleStatus(
    orgId: string,
    ctx: WhatsAppAiContextSnapshot,
  ): Promise<WhatsAppAiToolResult> {
    if (!ctx.vehicle) {
      return { tool: 'getVehicleStatus', ok: false, summary: 'Kein Fahrzeug verknüpft' };
    }
    const row = await this.prisma.vehicle.findFirst({
      where: { id: ctx.vehicle.id, organizationId: orgId },
      select: {
        latestState: {
          select: {
            odometerKm: true,
            fuelLevelRelative: true,
            evSoc: true,
            lastSeenAt: true,
          },
        },
      },
    });
    const state = row?.latestState;
    if (!state) {
      return {
        tool: 'getVehicleStatus',
        ok: false,
        summary: 'Aktuell keine verlässlichen Fahrzeugdaten verfügbar',
        stale: true,
      };
    }
    const parts: string[] = [];
    if (state.odometerKm != null) parts.push(`Kilometerstand: ${Math.round(state.odometerKm)} km`);
    if (state.fuelLevelRelative != null) parts.push(`Tankfüllung: ${Math.round(state.fuelLevelRelative)} %`);
    if (state.evSoc != null) parts.push(`Ladestand: ${Math.round(state.evSoc)} %`);
    const stale = isStaleTimestamp(state.lastSeenAt);
    return {
      tool: 'getVehicleStatus',
      ok: parts.length > 0 && !stale,
      summary:
        parts.length > 0
          ? parts.join('. ')
          : 'Aktuell keine verlässlichen Fahrzeugdaten verfügbar',
      stale,
      data: { vehicleId: ctx.vehicle.id, lastSeenAt: state.lastSeenAt?.toISOString() ?? null },
    };
  }

  async getVehicleLocationSummary(
    orgId: string,
    ctx: WhatsAppAiContextSnapshot,
  ): Promise<WhatsAppAiToolResult> {
    if (!ctx.vehicle) {
      return { tool: 'getVehicleLocationSummary', ok: false, summary: 'Kein Fahrzeug verknüpft' };
    }
    try {
      const gps = await this.vehicles.getLiveGps(ctx.vehicle.id, orgId);
      const stale =
        gps.source === 'cache' ||
        !gps.latitude ||
        !gps.longitude ||
        isStaleTimestamp(gps.lastSeenAt ? new Date(gps.lastSeenAt) : null);

      if (stale && ctx.station?.name) {
        return {
          tool: 'getVehicleLocationSummary',
          ok: true,
          summary: `Fahrzeug ist der Buchung zufolge an Station ${ctx.station.name} hinterlegt. Bitte prüfe vor Ort den Stellplatzhinweis in deiner Buchung.`,
          stale: true,
          data: { source: gps.source, stationName: ctx.station.name },
        };
      }

      if (gps.latitude && gps.longitude) {
        return {
          tool: 'getVehicleLocationSummary',
          ok: true,
          summary: ctx.station?.name
            ? `Letzter bekannter Standort nahe Station ${ctx.station.name} (Telematik). Bitte prüfe vor Ort den Stellplatzhinweis in deiner Buchung.`
            : 'Letzter bekannter Fahrzeugstandort über Telematik erfasst. Bitte prüfe vor Ort den Stellplatzhinweis in deiner Buchung.',
          stale: gps.source === 'cache',
          data: { latitude: gps.latitude, longitude: gps.longitude, source: gps.source },
        };
      }

      return {
        tool: 'getVehicleLocationSummary',
        ok: false,
        summary: 'Aktuell keine verlässlichen Fahrzeugdaten verfügbar',
        stale: true,
      };
    } catch {
      return {
        tool: 'getVehicleLocationSummary',
        ok: false,
        summary: 'Aktuell keine verlässlichen Fahrzeugdaten verfügbar',
        stale: true,
      };
    }
  }

  async getVehicleWarningSummary(
    orgId: string,
    ctx: WhatsAppAiContextSnapshot,
  ): Promise<WhatsAppAiToolResult> {
    if (!ctx.vehicle) {
      return { tool: 'getVehicleWarningSummary', ok: false, summary: 'Kein Fahrzeug verknüpft' };
    }
    const openDtcs = await this.prisma.vehicleDtcEvent.count({
      where: {
        vehicleId: ctx.vehicle.id,
        isActive: true,
      },
    });
    if (openDtcs > 0) {
      return {
        tool: 'getVehicleWarningSummary',
        ok: true,
        summary: `${openDtcs} aktive Fehlercode(s) im System — bitte vorsichtig weiterfahren.`,
        data: { openDtcCount: openDtcs },
      };
    }
    return {
      tool: 'getVehicleWarningSummary',
      ok: false,
      summary: 'Keine aktiven Warnmeldungen in SynqDrive hinterlegt',
      stale: true,
    };
  }

  async getOpenDamages(
    ctx: WhatsAppAiContextSnapshot,
  ): Promise<WhatsAppAiToolResult> {
    if (!ctx.vehicle) {
      return { tool: 'getOpenDamages', ok: false, summary: 'Kein Fahrzeug verknüpft' };
    }
    const rows = await this.damages.findActive(ctx.vehicle.id);
    if (rows.length === 0) {
      return { tool: 'getOpenDamages', ok: true, summary: 'Keine offenen Schäden am Fahrzeug hinterlegt' };
    }
    return {
      tool: 'getOpenDamages',
      ok: true,
      summary: `${rows.length} offene(r) Schaden(s) am Fahrzeug hinterlegt`,
      data: { count: rows.length },
    };
  }

  async createHumanReviewTask(
    orgId: string,
    ctx: WhatsAppAiContextSnapshot,
    reason: string,
    userId?: string,
  ): Promise<WhatsAppAiToolResult> {
    const task = await this.tasks.create(
      orgId,
      {
        title: `WhatsApp Human Review — ${ctx.conversationId.slice(0, 8)}`,
        description: reason,
        category: 'support',
        type: 'CUSTOMER_FOLLOWUP',
        sourceType: 'SYSTEM',
        source: 'WHATSAPP_AI_ROUTER',
        customerId: ctx.customer?.id,
        bookingId: ctx.booking?.id,
        vehicleId: ctx.vehicle?.id,
        priority: 'HIGH',
      },
      userId,
    );
    return {
      tool: 'createHumanReviewTask',
      ok: true,
      summary: 'Human-review task created',
      data: { taskId: (task as { id?: string }).id },
    };
  }

  async runTools(
    orgId: string,
    ctx: WhatsAppAiContextSnapshot,
    tools: WhatsAppAiToolName[],
  ): Promise<WhatsAppAiToolResult[]> {
    const results: WhatsAppAiToolResult[] = [];
    for (const tool of tools) {
      switch (tool) {
        case 'getBookingSummary':
          results.push(await this.getBookingSummary(orgId, ctx));
          break;
        case 'getPickupInstructions':
          results.push(await this.getPickupInstructions(orgId, ctx));
          break;
        case 'getReturnInstructions':
          results.push(await this.getReturnInstructions(orgId, ctx));
          break;
        case 'getMissingDocuments':
          results.push(await this.getMissingDocuments(orgId, ctx));
          break;
        case 'getPaymentDepositStatus':
          results.push(await this.getPaymentDepositStatus(orgId, ctx));
          break;
        case 'getVehicleStatus':
          results.push(await this.getVehicleStatus(orgId, ctx));
          break;
        case 'getVehicleLocationSummary':
          results.push(await this.getVehicleLocationSummary(orgId, ctx));
          break;
        case 'getVehicleWarningSummary':
          results.push(await this.getVehicleWarningSummary(orgId, ctx));
          break;
        case 'getOpenDamages':
          results.push(await this.getOpenDamages(ctx));
          break;
        default:
          break;
      }
    }
    return results;
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return iso;
  }
}

function isStaleTimestamp(d: Date | string | null | undefined): boolean {
  if (!d) return true;
  const ts = d instanceof Date ? d.getTime() : new Date(d).getTime();
  if (Number.isNaN(ts)) return true;
  return Date.now() - ts > STALE_GPS_MS;
}

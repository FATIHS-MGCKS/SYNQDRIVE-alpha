import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { DtcSeverity } from '@prisma/client';

// ── Constants ──────────────────────────────────────────────────────────────────

/** Data is considered stale if no successful check in 6 hours (= 2× poll interval). */
const DTC_STALE_THRESHOLD_MS = 6 * 60 * 60_000;

// ── Helpers ────────────────────────────────────────────────────────────────────

function getDtcCategory(code: string): string {
  switch (code?.charAt(0)?.toUpperCase()) {
    case 'P':
      return 'Powertrain';
    case 'B':
      return 'Body';
    case 'C':
      return 'Chassis';
    case 'U':
      return 'Network';
    default:
      return 'Unknown';
  }
}

function getSeverityDisplay(
  severity: string | null | undefined,
): 'low' | 'medium' | 'high' {
  switch ((severity ?? '').toUpperCase()) {
    case 'INFO':
      return 'low';
    case 'CRITICAL':
      return 'high';
    default:
      return 'medium';
  }
}

function isDataStale(lastSuccessfulCheckAt: Date | null | undefined): boolean {
  if (!lastSuccessfulCheckAt) return true;
  return (
    Date.now() - new Date(lastSuccessfulCheckAt).getTime() >
    DTC_STALE_THRESHOLD_MS
  );
}

// ── Service ────────────────────────────────────────────────────────────────────

@Injectable()
export class DtcService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Basic reads ─────────────────────────────────────────────────────────────

  async findByVehicle(vehicleId: string) {
    return this.prisma.vehicleDtcEvent.findMany({
      where: { vehicleId },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  async findActive(vehicleId: string) {
    return this.prisma.vehicleDtcEvent.findMany({
      where: { vehicleId, isActive: true },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  async getStats(vehicleId: string) {
    const [active, total, latestState] = await Promise.all([
      this.prisma.vehicleDtcEvent.count({ where: { vehicleId, isActive: true } }),
      this.prisma.vehicleDtcEvent.count({ where: { vehicleId } }),
      this.prisma.vehicleLatestState.findUnique({
        where: { vehicleId },
        select: {
          lastDtcPollAt: true,
          lastDtcSuccessfulCheckAt: true,
          dtcPollStatus: true,
        },
      }),
    ]);
    return {
      active,
      total,
      lastChecked: latestState?.lastDtcPollAt ?? null,
      lastSuccessfulCheck: latestState?.lastDtcSuccessfulCheckAt ?? null,
      pollStatus: latestState?.dtcPollStatus ?? null,
    };
  }

  // ── Summary — UI-ready, freshness-aware ─────────────────────────────────────

  /**
   * Returns a UI-ready DTC summary for the Quick View box.
   *
   * Status values:
   *   • 'unavailable'   — no DTC poll has ever been attempted
   *   • 'stale'         — last successful check is older than the stale threshold
   *   • 'clean'         — fresh check, no active faults
   *   • 'active_faults' — fresh check, faults present
   *
   * IMPORTANT: 'clean' is NEVER returned when data is stale.
   */
  async getSummary(vehicleId: string) {
    const [latestState, previewFaults] = await Promise.all([
      this.prisma.vehicleLatestState.findUnique({
        where: { vehicleId },
        select: {
          lastDtcPollAt: true,
          lastDtcSuccessfulCheckAt: true,
          dtcPollStatus: true,
        },
      }),
      this.prisma.vehicleDtcEvent.findMany({
        where: { vehicleId, isActive: true },
        orderBy: [{ severity: 'desc' }, { lastSeenAt: 'desc' }],
        take: 3,
      }),
    ]);

    const lastCheckedAt = latestState?.lastDtcPollAt ?? null;
    const lastSuccessfulCheckAt = latestState?.lastDtcSuccessfulCheckAt ?? null;
    const stale = isDataStale(lastSuccessfulCheckAt);
    const hasNeverBeenChecked = !lastCheckedAt;

    // Count real active faults (only meaningful when fresh)
    const activeFaultCount =
      stale || hasNeverBeenChecked
        ? 0
        : await this.prisma.vehicleDtcEvent.count({
            where: { vehicleId, isActive: true },
          });

    type DtcStatus = 'clean' | 'active_faults' | 'stale' | 'unavailable';
    let status: DtcStatus;
    let message: string;

    if (hasNeverBeenChecked) {
      status = 'unavailable';
      message = 'No DTC check has been performed yet';
    } else if (stale) {
      status = 'stale';
      message = 'DTC monitoring status is outdated';
    } else if (activeFaultCount > 0) {
      status = 'active_faults';
      message = `${activeFaultCount} active fault code${activeFaultCount > 1 ? 's' : ''} detected`;
    } else {
      status = 'clean';
      message = 'No active fault codes';
    }

    return {
      status,
      activeFaultCount,
      activeFaultPreview:
        status === 'active_faults'
          ? previewFaults.map((f) => ({
              code: f.dtcCode,
              label: f.description ?? `DTC ${f.dtcCode}`,
              category: getDtcCategory(f.dtcCode),
              severity: getSeverityDisplay(f.severity),
            }))
          : [],
      lastCheckedAt: lastCheckedAt?.toISOString() ?? null,
      lastSuccessfulCheckAt: lastSuccessfulCheckAt?.toISOString() ?? null,
      isStale: stale,
      message,
    };
  }

  // ── Detail — full data for the Detail Modal ──────────────────────────────────

  /**
   * Returns the full detail payload for the DTC Detail Modal:
   *  • currentFaults  — fresh active codes (empty if stale)
   *  • history        — all historical events for this vehicle
   *  • monitoring     — poll metadata for Section C of the modal
   */
  async getDetail(vehicleId: string) {
    const [activeFaults, allEvents, latestState] = await Promise.all([
      this.prisma.vehicleDtcEvent.findMany({
        where: { vehicleId, isActive: true },
        orderBy: [{ severity: 'desc' }, { lastSeenAt: 'desc' }],
      }),
      this.prisma.vehicleDtcEvent.findMany({
        where: { vehicleId },
        orderBy: { firstSeenAt: 'desc' },
      }),
      this.prisma.vehicleLatestState.findUnique({
        where: { vehicleId },
        select: {
          lastDtcPollAt: true,
          lastDtcSuccessfulCheckAt: true,
          dtcPollStatus: true,
          dtcPollError: true,
        },
      }),
    ]);

    const lastSuccessfulCheckAt = latestState?.lastDtcSuccessfulCheckAt ?? null;
    const stale = isDataStale(lastSuccessfulCheckAt);

    const toDto = (e: {
      id: string;
      dtcCode: string;
      description: string | null;
      severity: DtcSeverity;
      isActive: boolean;
      firstSeenAt: Date;
      lastSeenAt: Date;
      clearedAt: Date | null;
      occurrenceCount: number;
    }) => ({
      id: e.id,
      code: e.dtcCode,
      label: e.description ?? `DTC ${e.dtcCode}`,
      category: getDtcCategory(e.dtcCode),
      severity: getSeverityDisplay(e.severity),
      severityRaw: e.severity,
      isActive: e.isActive,
      firstSeenAt: e.firstSeenAt?.toISOString() ?? null,
      lastSeenAt: e.lastSeenAt?.toISOString() ?? null,
      clearedAt: e.clearedAt?.toISOString() ?? null,
      occurrenceCount: e.occurrenceCount ?? 1,
    });

    type CurrentStatus = 'clean' | 'active_faults' | 'stale' | 'unavailable';
    let currentStatus: CurrentStatus;
    if (!latestState?.lastDtcPollAt) {
      currentStatus = 'unavailable';
    } else if (stale) {
      currentStatus = 'stale';
    } else if (activeFaults.length > 0) {
      currentStatus = 'active_faults';
    } else {
      currentStatus = 'clean';
    }

    return {
      currentFaults: {
        status: currentStatus,
        isStale: stale,
        // Never expose active faults when data is stale — prevents false clean/active display
        activeFaults: stale ? [] : activeFaults.map(toDto),
      },
      history: allEvents.map(toDto),
      monitoring: {
        pollIntervalHours: 3,
        staleThresholdHours: 6,
        lastCheckedAt: latestState?.lastDtcPollAt?.toISOString() ?? null,
        lastSuccessfulCheckAt: lastSuccessfulCheckAt?.toISOString() ?? null,
        pollStatus: latestState?.dtcPollStatus ?? null,
        pollError: latestState?.dtcPollError ?? null,
        isStale: stale,
        signalSource: 'obdDTCList',
      },
    };
  }

  // ── Mutations ───────────────────────────────────────────────────────────────

  /**
   * Upsert a DTC code for a vehicle.
   * If the code is already active: update lastSeenAt and increment occurrenceCount.
   * If the code is new (or was previously cleared): create a fresh active row.
   */
  async upsertDtc(
    vehicleId: string,
    dtcCode: string,
    description?: string,
    severity?: DtcSeverity,
  ) {
    const now = new Date();
    const existing = await this.prisma.vehicleDtcEvent.findFirst({
      where: { vehicleId, dtcCode, isActive: true },
    });

    if (existing) {
      return this.prisma.vehicleDtcEvent.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: now,
          occurrenceCount: { increment: 1 },
          ...(description ? { description } : {}),
        },
      });
    }

    return this.prisma.vehicleDtcEvent.create({
      data: {
        vehicle: { connect: { id: vehicleId } },
        dtcCode,
        description: description ?? null,
        severity: severity ?? 'WARNING',
        firstSeenAt: now,
        lastSeenAt: now,
        occurrenceCount: 1,
      },
    });
  }

  async clearDtc(vehicleId: string, dtcCode: string) {
    return this.prisma.vehicleDtcEvent.updateMany({
      where: { vehicleId, dtcCode, isActive: true },
      data: { isActive: false, clearedAt: new Date() },
    });
  }

  async clearAllActive(vehicleId: string) {
    return this.prisma.vehicleDtcEvent.updateMany({
      where: { vehicleId, isActive: true },
      data: { isActive: false, clearedAt: new Date() },
    });
  }
}

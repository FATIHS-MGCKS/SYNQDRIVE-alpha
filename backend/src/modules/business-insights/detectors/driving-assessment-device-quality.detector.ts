import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  DetectorContext,
  InsightCandidate,
  InsightDetector,
  InsightEntityScope,
  InsightSeverity,
  InsightType,
} from '../insight.types';

@Injectable()
export class DrivingAssessmentDeviceQualityDetector implements InsightDetector {
  readonly type = InsightType.DRIVING_ASSESSMENT_DEVICE_QUALITY;

  constructor(private readonly prisma: PrismaService) {}

  async detect(ctx: DetectorContext): Promise<InsightCandidate[]> {
    const rows = await this.prisma.vehicleDrivingAssessmentQuality.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: { in: ['DEGRADED', 'RECOVERING'] },
      },
      include: {
        vehicle: { select: { id: true, licensePlate: true, make: true, model: true } },
      },
    });

    return rows.map((row) => {
      const label =
        row.vehicle.licensePlate?.trim() ||
        [row.vehicle.make, row.vehicle.model].filter(Boolean).join(' ') ||
        'Fahrzeug';
      const recovering = row.status === 'RECOVERING';
      return {
        type: this.type,
        severity: recovering ? InsightSeverity.INFO : InsightSeverity.WARNING,
        priority: recovering ? 40 : 55,
        title: recovering
          ? `Fahrbewertung normalisiert sich — ${label}`
          : `Fahrbewertung eingeschränkt — ${label}`,
        message: recovering
          ? 'Die native Event-Qualität verbessert sich — Fahrbewertung noch mit Vorsicht nutzen.'
          : 'Das LTE-Gerät sendet ungewöhnlich viele native Fahrereignisse. Fahrbewertung kann unzuverlässig sein (DIMO: Steckung/Kalibrierung prüfen).',
        actionLabel: 'Fahrzeug öffnen',
        actionType: 'OPEN_VEHICLE',
        entityScope: InsightEntityScope.VEHICLE,
        entityIds: [row.vehicleId],
        metrics: {
          vehicleStatus: row.status,
          degradedSince: row.degradedSince?.toISOString() ?? null,
          evidence: row.evidenceJson,
        },
        reasons: [
          recovering
            ? 'Gerätequalität im Erholungsmodus'
            : 'Anhaltend erhöhte native Event-Dichte',
        ],
        confidence: 0.85,
        dedupeKey: `driving_assessment_device_quality:${row.vehicleId}`,
      } satisfies InsightCandidate;
    });
  }
}

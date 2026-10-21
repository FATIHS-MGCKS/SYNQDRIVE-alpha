import { Injectable } from '@nestjs/common';
import { BatteryGroundTruthRepository } from './ground-truth.repository';

export type GroundTruthInspectionRowV1 = {
  id: string;
  groundTruthType: string;
  batteryScope: string;
  effectiveAt: string;
  sourceAuthority: string;
  verificationStatus: string;
  active: boolean;
  sourceContentFingerprint: string;
  sourceServiceEventId: string | null;
  sourceDocumentExtractionId: string | null;
  sourceBatteryEvidenceId: string | null;
  sourceMeasurementId: string | null;
  supersedesGroundTruthEventId: string | null;
  revocationCount: number;
};

export type GroundTruthVehicleInspectionV1 = {
  organizationId: string;
  vehicleId: string;
  active: GroundTruthInspectionRowV1[];
  history: GroundTruthInspectionRowV1[];
};

@Injectable()
export class BatteryGroundTruthInspectionService {
  constructor(private readonly repository: BatteryGroundTruthRepository) {}

  async inspectVehicle(
    organizationId: string,
    vehicleId: string,
  ): Promise<GroundTruthVehicleInspectionV1> {
    const rows = await this.repository.listForVehicle(organizationId, vehicleId);
    const mapped = rows.map((row) => ({
      id: row.id,
      groundTruthType: row.groundTruthType,
      batteryScope: row.batteryScope,
      effectiveAt: row.effectiveAt.toISOString(),
      sourceAuthority: row.sourceAuthority,
      verificationStatus: row.verificationStatus,
      active: this.repository.isActiveRow(row),
      sourceContentFingerprint: row.sourceContentFingerprint,
      sourceServiceEventId: row.sourceServiceEventId,
      sourceDocumentExtractionId: row.sourceDocumentExtractionId,
      sourceBatteryEvidenceId: row.sourceBatteryEvidenceId,
      sourceMeasurementId: row.sourceMeasurementId,
      supersedesGroundTruthEventId: row.supersedesGroundTruthEventId,
      revocationCount: row.revocations.length,
    }));
    return {
      organizationId,
      vehicleId,
      active: mapped.filter((r) => r.active),
      history: mapped.filter((r) => !r.active),
    };
  }
}

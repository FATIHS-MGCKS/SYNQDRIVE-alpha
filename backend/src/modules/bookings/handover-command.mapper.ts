import { BadRequestException } from '@nestjs/common';
import type { CreateHandoverProtocolDto } from './dto/handover/create-handover-protocol.dto';
import type { CreateHandoverCommand } from './handover-command.types';

export function mapCreateHandoverProtocolDtoToCommand(
  dto: CreateHandoverProtocolDto,
): CreateHandoverCommand {
  const fuelPercent = resolveFuelOrChargePercent(dto);

  return {
    performedAt: dto.performedAt ?? null,
    pickupGateOverrideReason: dto.pickupGateOverrideReason?.trim() ?? null,
    odometerOverrideReason: dto.odometerOverrideReason?.trim() ?? null,
    odometerKm: dto.odometerKm,
    fuelPercent,
    fuelFull: dto.fuelFull,
    exteriorClean: dto.exteriorClean,
    interiorClean: dto.interiorClean,
    tiresSeasonOk: dto.tiresSeasonOk,
    warningLightsOn: dto.warningLightsOn,
    warningLightsNotes: dto.warningLightsNotes?.trim() ?? null,
    notes: mergeHandoverNotes(dto),
    customerSignatureName: dto.customerSignatureName?.trim() ?? null,
    customerSignatureDataUrl: dto.customerSignatureDataUrl?.trim() ?? null,
    staffSignatureName: dto.staffSignatureName?.trim() ?? null,
    staffSignatureDataUrl: dto.staffSignatureDataUrl?.trim() ?? null,
    documentsAcknowledged: dto.documentsAcknowledged,
    damageIds: dto.damageIds,
    actualStationId: dto.actualStationId ?? null,
    technicalObservations: dto.technicalObservations?.map((obs) => ({
      description: obs.description.trim(),
      category: obs.category?.trim(),
      affectedArea: obs.affectedArea?.trim(),
      severity: obs.severity?.trim(),
      blocksRental: obs.blocksRental,
    })),
    keysHandedOver: dto.keysHandedOver,
    idDocumentVerified: dto.idDocumentVerified,
    licenseVerified: dto.licenseVerified,
  };
}

function resolveFuelOrChargePercent(dto: CreateHandoverProtocolDto): number {
  if (dto.fuelPercent != null && dto.chargePercent != null) {
    if (dto.fuelPercent !== dto.chargePercent) {
      throw new BadRequestException({
        message: 'fuelPercent and chargePercent must match when both are provided',
        code: 'HANDOVER_FUEL_CHARGE_CONFLICT',
      });
    }
    return dto.fuelPercent;
  }
  if (dto.fuelPercent != null) return dto.fuelPercent;
  if (dto.chargePercent != null) return dto.chargePercent;
  throw new BadRequestException({
    message: 'fuelPercent or chargePercent is required',
    code: 'HANDOVER_FUEL_PERCENT_REQUIRED',
  });
}

function mergeHandoverNotes(dto: CreateHandoverProtocolDto): string | null {
  const parts: string[] = [];
  if (dto.notes?.trim()) parts.push(dto.notes.trim());
  const flags: string[] = [];
  if (dto.keysHandedOver === true) flags.push('Schlüssel übergeben');
  if (dto.idDocumentVerified === true) flags.push('Ausweis geprüft');
  if (dto.licenseVerified === true) flags.push('Führerschein geprüft');
  if (flags.length > 0) parts.push(`[${flags.join('; ')}]`);
  return parts.length > 0 ? parts.join(' ') : null;
}

/**
 * VO-SIG-01 read-only fleet inventory (stdout JSON). No mutations.
 */
import { PrismaClient } from '@prisma/client';

const DIMO_TOKEN_HINTS = ['186946', '187361', '187784', '192922', '187336', '190497'];

const p = new PrismaClient();

function modalityHint(row) {
  const activeLinks = row.links.filter((l) => l.isActive);
  const hasDimo = activeLinks.some((l) => l.sourceType === 'DIMO');
  const hasHm = activeLinks.some((l) => l.sourceType === 'HIGH_MOBILITY');
  if (!activeLinks.length) {
    return row.dimoVehicleId
      ? { modality: 'UNKNOWN_REQUIRES_REVIEW', evidence: 'LEGACY_DIMO_VEHICLE_ID_WITHOUT_ACTIVE_LINK' }
      : { modality: 'MANUAL_NO_TELEMETRY', evidence: 'NO_ACTIVE_LINKS' };
  }
  if (hasHm && !hasDimo) return { modality: 'OEM_CLOUD', evidence: 'HM_ACTIVE_LINK' };
  if (hasDimo) {
    if (row.hardwareType === 'LTE_R1' || row.hardwareType === 'SMART5') {
      return { modality: 'HARDWARE_DEVICE', evidence: `hardwareType=${row.hardwareType}` };
    }
    if (row.hardwareType === 'UNKNOWN') {
      return { modality: 'UNKNOWN_REQUIRES_REVIEW', evidence: 'DIMO_LINK_HARDWARE_UNKNOWN' };
    }
    return { modality: 'SOFTWARE_INTEGRATION', evidence: `hardwareType=${row.hardwareType}` };
  }
  return { modality: 'UNKNOWN_REQUIRES_REVIEW', evidence: 'UNCLASSIFIED_LINK_SET' };
}

async function main() {
  const vehicles = await p.vehicle.findMany({
    where: { registryLifecycle: { in: ['ACTIVE', 'OFFBOARDED'] } },
    select: {
      id: true,
      organizationId: true,
      registryLifecycle: true,
      hardwareType: true,
      vin: true,
      dimoVehicleId: true,
      dimoVehicle: { select: { id: true, externalId: true, vin: true } },
      dataSourceLinks: {
        select: {
          id: true,
          provider: true,
          sourceType: true,
          sourceSubtype: true,
          sourceReferenceId: true,
          dimoVehicleId: true,
          isActive: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const hmByVehicle = await p.highMobilityVehicle.findMany({
    where: { synqdriveVehicleId: { not: null } },
    select: {
      id: true,
      synqdriveVehicleId: true,
      hmVehicleReference: true,
      registrationState: true,
      brand: true,
    },
  });
  const hmMap = new Map();
  for (const h of hmByVehicle) {
    const list = hmMap.get(h.synqdriveVehicleId) ?? [];
    list.push(h);
    hmMap.set(h.synqdriveVehicleId, list);
  }

  const inventory = vehicles.map((v) => {
    const activeLinks = v.dataSourceLinks.filter((l) => l.isActive);
    const unknownFields = [];
    if (v.hardwareType === 'UNKNOWN') unknownFields.push('hardwareType');
    for (const l of activeLinks) {
      if (l.provider === 'UNKNOWN') unknownFields.push(`link:${l.id}:provider`);
    }
    const { modality, evidence } = modalityHint({ ...v, links: v.dataSourceLinks });
    let actionable = null;
    if (activeLinks.some((l) => l.provider === 'UNKNOWN' && l.sourceType === 'HIGH_MOBILITY')) {
      actionable = 'SET_PROVIDER_HIGH_MOBILITY_ON_LINK';
    }
    if (v.hardwareType === 'UNKNOWN' && (activeLinks.some((l) => l.sourceType === 'DIMO') || v.dimoVehicleId)) {
      actionable = actionable
        ? `${actionable};CLASSIFY_HARDWARE_OR_OEM_MODALITY`
        : 'CLASSIFY_HARDWARE_OR_OEM_MODALITY';
    }
    return {
      organizationId: v.organizationId,
      vehicleId: v.id,
      registryLifecycle: v.registryLifecycle,
      vin: v.vin,
      hardwareType: v.hardwareType,
      dimoExternalId: v.dimoVehicle?.externalId ?? null,
      activeSourceLinks: activeLinks.map((l) => ({
        sourceLinkId: l.id,
        provider: l.provider,
        sourceType: l.sourceType,
        sourceSubtype: l.sourceSubtype,
        providerVehicleRef: l.dimoVehicleId ?? l.sourceReferenceId,
      })),
      hmMirrors: (hmMap.get(v.id) ?? []).map((h) => ({
        hmId: h.id,
        hmVehicleReference: h.hmVehicleReference,
        registrationState: h.registrationState,
      })),
      connectionModalityInferred: modality,
      classificationEvidence: evidence,
      unknownOrInconsistentFields: unknownFields,
      actionableCorrection: actionable,
    };
  });

  const tokenHits = [];
  for (const hint of DIMO_TOKEN_HINTS) {
    const byToken = await p.dimoVehicle.findFirst({
      where: { tokenId: Number(hint) },
      select: {
        id: true,
        externalId: true,
        tokenId: true,
        registeredVehicles: {
          select: { id: true, organizationId: true, registryLifecycle: true },
        },
      },
    });
    const dimo =
      byToken ??
      (await p.dimoVehicle.findFirst({
        where: { externalId: hint },
        select: {
          id: true,
          externalId: true,
          tokenId: true,
          registeredVehicles: {
            select: { id: true, organizationId: true, registryLifecycle: true },
          },
        },
      }));
    tokenHits.push(dimo ? { tokenHint: hint, ...dimo, vehicles: dimo.registeredVehicles } : { tokenHint: hint, found: false });
  }

  const activeLinks = await p.vehicleDataSourceLink.findMany({
    where: { isActive: true, vehicle: { registryLifecycle: 'ACTIVE' } },
    select: { id: true, provider: true, sourceType: true },
  });

  const summary = {
    activeVehicles: inventory.filter((r) => r.registryLifecycle === 'ACTIVE').length,
    offboardedVehicles: inventory.filter((r) => r.registryLifecycle === 'OFFBOARDED').length,
    activeSourceLinks: activeLinks.length,
    providerUnknownOnActiveLinks: activeLinks.filter((l) => l.provider === 'UNKNOWN').length,
    hardwareUnknownActive: inventory.filter(
      (r) => r.registryLifecycle === 'ACTIVE' && r.hardwareType === 'UNKNOWN',
    ).length,
    modalityUnknownActive: inventory.filter(
      (r) =>
        r.registryLifecycle === 'ACTIVE' &&
        r.connectionModalityInferred === 'UNKNOWN_REQUIRES_REVIEW',
    ).length,
  };

  console.log(JSON.stringify({ summary, tokenHits, inventory }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());

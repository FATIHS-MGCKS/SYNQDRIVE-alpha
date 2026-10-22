import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { PdiInstalledDeviceObservationInput } from './pdi-identity-drift-shadow.types';

export type PdiIdentityDriftDataLoadResult = {
  devices: PdiInstalledDeviceObservationInput[];
  knownInventorySerials: string[];
};

function sha256Json(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value ?? null), 'utf8').digest('hex');
}

/**
 * Read-only load from PDI + DIMO mirror. Fails soft when inventory tables are absent (pre-PDI deploys).
 */
export async function loadPdiIdentityDriftObservationData(
  prisma: PrismaClient,
): Promise<PdiIdentityDriftDataLoadResult> {
  try {
    const rows = await prisma.$queryRaw<
      Array<{
        physical_device_id: string;
        vehicle_id: string;
        token_id: number | null;
        expected_serial: string | null;
        identity_status: string;
        inventory_status: string;
        active_install_count: number;
        observed_serial: string | null;
        mirror_synced_at: Date | null;
        raw_json: unknown;
      }>
    >`
      SELECT pd.id::text AS physical_device_id,
             pda.vehicle_id::text AS vehicle_id,
             dv.token_id::int AS token_id,
             pd.serial_number AS expected_serial,
             pd.identity_status::text AS identity_status,
             pd.status::text AS inventory_status,
             (
               SELECT count(*)::int
               FROM physical_device_assignments a
               WHERE a.physical_device_id = pd.id
                 AND a.assignment_kind = 'INSTALL'
                 AND a.effective_to IS NULL
                 AND a.vehicle_id IS NOT NULL
             ) AS active_install_count,
             dv.raw_json #>> '{aftermarketDevice,serial}' AS observed_serial,
             dv.synced_at AS mirror_synced_at,
             dv.raw_json AS raw_json
      FROM physical_devices pd
      INNER JOIN physical_device_assignments pda
        ON pda.physical_device_id = pd.id
        AND pda.assignment_kind = 'INSTALL'
        AND pda.effective_to IS NULL
        AND pda.vehicle_id IS NOT NULL
      INNER JOIN vehicles v ON v.id = pda.vehicle_id
      LEFT JOIN dimo_vehicles dv ON dv.id = v.dimo_vehicle_id
      WHERE pd.model_code = 'RUPTELA_R1'
    `;

    const serialRows = await prisma.$queryRaw<Array<{ serial_number: string | null }>>`
      SELECT serial_number FROM physical_devices WHERE serial_number IS NOT NULL
    `;

    const devices: PdiInstalledDeviceObservationInput[] = rows.map((r) => ({
      physicalDeviceId: r.physical_device_id,
      vehicleId: r.vehicle_id,
      dimoTokenId: r.token_id,
      expectedSerial: r.expected_serial ?? '',
      identityStatus: r.identity_status,
      inventoryStatus: r.inventory_status,
      activeInstallAssignmentCount: r.active_install_count,
      observedSerial: r.observed_serial,
      mirrorSyncedAt: r.mirror_synced_at,
      mirrorRawJsonSha256: sha256Json(r.raw_json),
    }));

    const knownInventorySerials = serialRows
      .map((s) => s.serial_number)
      .filter((s): s is string => Boolean(s?.trim()));

    return { devices, knownInventorySerials };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes('physical_devices') &&
      (message.includes('does not exist') || message.includes('relation'))
    ) {
      return { devices: [], knownInventorySerials: [] };
    }
    throw error;
  }
}

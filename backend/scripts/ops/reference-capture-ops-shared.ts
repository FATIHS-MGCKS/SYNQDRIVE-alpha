import * as fs from 'fs';
import * as path from 'path';
import { HardwareType, ReferenceCaptureSessionStatus } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import { ACTIVE_REFERENCE_CAPTURE_BLOCKING_STATUSES } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-prearm.policy';

export function loadOpsEnv(): void {
  const candidates = [
    process.env.SYNQDRIVE_BACKEND_ENV,
    '/opt/synqdrive/shared/backend.env',
    path.resolve(__dirname, '../../.env'),
  ].filter(Boolean) as string[];
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
      }
    }
  }
}

export function parseOpsArg(prefix: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${prefix}=`));
  if (eq) return eq.split('=').slice(1).join('=').trim() || undefined;
  const idx = process.argv.indexOf(prefix);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1].trim();
  return undefined;
}

export async function resolveLteR1Vehicle(
  prisma: PrismaService,
  organizationId: string,
  options: { vehicleId?: string; licensePlate?: string },
) {
  if (options.vehicleId) {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: options.vehicleId, organizationId, hardwareType: HardwareType.LTE_R1 },
      select: {
        id: true,
        licensePlate: true,
        fuelType: true,
        hardwareType: true,
        dimoVehicle: { select: { tokenId: true, connectionStatus: true, lastSignal: true } },
        latestState: { select: { lastSeenAt: true } },
      },
    });
    if (!vehicle?.dimoVehicle?.tokenId) {
      throw new Error(`Vehicle ${options.vehicleId} not found or missing DIMO token`);
    }
    return vehicle;
  }

  const compact = (options.licensePlate ?? '').replace(/\s+/g, '').toUpperCase();
  const candidates = await prisma.vehicle.findMany({
    where: { organizationId, hardwareType: HardwareType.LTE_R1 },
    select: {
      id: true,
      licensePlate: true,
      fuelType: true,
      hardwareType: true,
      dimoVehicle: { select: { tokenId: true, connectionStatus: true, lastSignal: true } },
      latestState: { select: { lastSeenAt: true } },
    },
  });

  const matches = candidates.filter((v) => {
    const plate = (v.licensePlate ?? '').replace(/\s+/g, '').toUpperCase();
    return plate.includes(compact) || compact.includes(plate);
  });

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one LTE_R1 vehicle for plate "${options.licensePlate}"; found ${matches.length}`,
    );
  }
  const vehicle = matches[0];
  if (!vehicle.dimoVehicle?.tokenId) {
    throw new Error(`Matched vehicle missing DIMO token`);
  }
  return vehicle;
}

export async function findBlockingReferenceSession(
  prisma: PrismaService,
  organizationId: string,
  vehicleId: string,
) {
  return prisma.referenceCaptureSession.findFirst({
    where: {
      organizationId,
      vehicleId,
      status: { in: ACTIVE_REFERENCE_CAPTURE_BLOCKING_STATUSES },
    },
    select: { id: true, status: true, createdAt: true, runnerJobId: true, pendingCycleJobId: true },
    orderBy: { createdAt: 'desc' },
  });
}

export function assertReferenceCaptureEnabled(): void {
  if (process.env.REFERENCE_CAPTURE_ENABLED !== 'true') {
    throw new Error('REFERENCE_CAPTURE_ENABLED must be true');
  }
}

export function printReadyToDriveBanner(success: boolean, sessionId: string, reason?: string): void {
  if (success) {
    console.log('========================================');
    console.log('READY_TO_DRIVE = YES');
    console.log('REFERENCE CAPTURE IS RUNNING');
    console.log(`SESSION_ID = ${sessionId}`);
    console.log('========================================');
    return;
  }
  console.log('========================================');
  console.log('READY_TO_DRIVE = NO');
  console.log('DO NOT DRIVE AS REFERENCE TEST');
  console.log(`REASON = ${reason ?? 'unknown'}`);
  console.log('========================================');
}

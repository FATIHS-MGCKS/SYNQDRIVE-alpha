/**
 * PDI P1B.7 Gate B — single authorized manual intake via PhysicalDeviceInventoryService.
 *
 * Server-trusted operator path (SSH synqdrive-admin). Does not expose HTTP or bypass JWT guards.
 * Master Admin attribution uses a real MASTER_ADMIN user resolved from the database — never fabricated.
 *
 * Default: read-only dry run (preflight + payload preview).
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/pdi-p1b7-manual-intake-operator.ts \
 *     --actor-email=admin@synqdrive.de \
 *     --operator-attestation="Owner authorized PDI P1B.7 Gate B manual intake DIMO 192922"
 *
 * Execute (production — requires env gate + explicit flags):
 *   PDI_P1B7_MANUAL_INTAKE_OPERATOR_ENABLED=true \
 *     npx ts-node -r tsconfig-paths/register scripts/ops/pdi-p1b7-manual-intake-operator.ts \
 *     --execute --confirm-p1b7-manual-intake \
 *     --actor-email=admin@synqdrive.de \
 *     --operator-attestation="Owner authorized PDI P1B.7 Gate B manual intake DIMO 192922"
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { AuditService } from '../../src/modules/activity-log/audit.service';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { PhysicalDeviceInventoryService } from '../../src/modules/physical-device-inventory/physical-device-inventory.service';
import {
  assertPdiP1b7ExecuteGates,
  buildPdiP1b7ManualIntakeDto,
  PDI_P1B7_AUTHORIZED_INTAKE,
  recordPdiP1b7ManualIntakeActivityAudit,
  resolveAuthorizedMasterAdminActor,
  runPdiP1b7Preflight,
  toSafeOperatorResultSummary,
  validatePdiP1b7ManualIntakeDto,
} from '../../src/modules/physical-device-inventory/pdi-p1b7-manual-intake-operator.lib';

function loadEnvFile(): void {
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

async function main(): Promise<void> {
  loadEnvFile();
  const execute = process.argv.includes('--execute');
  const confirm = process.argv.includes('--confirm-p1b7-manual-intake');
  const actorUserId = parseArg('--actor-user-id');
  const actorEmail = parseArg('--actor-email');
  const operatorAttestation = parseArg('--operator-attestation');

  assertPdiP1b7ExecuteGates({
    execute,
    confirmFlag: confirm,
    operatorAttestation,
  });

  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);
    const inventory = app.get(PhysicalDeviceInventoryService);
    const audit = app.get(AuditService);

    const actor = await resolveAuthorizedMasterAdminActor(prisma, {
      actorUserId,
      actorEmail,
    });

    const preflight = await runPdiP1b7Preflight(prisma);
    const dto = buildPdiP1b7ManualIntakeDto();
    await validatePdiP1b7ManualIntakeDto(dto);

    const report = {
      mode: execute ? 'execute' : 'dry-run',
      authorizedScope: PDI_P1B7_AUTHORIZED_INTAKE,
      actor: { id: actor.id, email: actor.email, platformRole: actor.platformRole },
      preflight,
      plannedDto: {
        modelCode: dto.modelCode,
        serialNumber: dto.serialNumber,
        warehouseLocation: dto.warehouseLocation,
        ownerOrganizationId: dto.ownerOrganizationId,
        idempotencyKey: dto.idempotencyKey,
        intakeNotesLength: dto.intakeNotes?.length ?? 0,
        imei: null,
      },
    };

    if (!execute) {
      console.log(JSON.stringify(report, null, 2));
      if (!preflight.ok) {
        console.error('Dry-run preflight blocking reasons:', preflight.blockingReasons.join(', '));
        process.exitCode = 2;
      }
      return;
    }

    if (!preflight.ok) {
      throw new Error(`Preflight failed: ${preflight.blockingReasons.join(', ')}`);
    }

    const result = await inventory.manualIntake(dto, actor.id);
    const activityLogId = await recordPdiP1b7ManualIntakeActivityAudit(audit, {
      actorUserId: actor.id,
      operatorAttestation: operatorAttestation!,
      result,
      executeMode: true,
    });

    console.log(
      JSON.stringify(
        {
          ...report,
          result: toSafeOperatorResultSummary(result),
          activityAudit: {
            recorded: activityLogId != null,
            activityLogId,
            note:
              activityLogId == null
                ? 'Intake committed; Activity audit record failed (same fire-and-forget contract as HTTP controller — verify activity_logs manually)'
                : undefined,
          },
        },
        null,
        2,
      ),
    );

    if (activityLogId == null) {
      process.exitCode = 3;
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

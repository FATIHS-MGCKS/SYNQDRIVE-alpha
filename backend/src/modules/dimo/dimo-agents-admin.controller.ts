import { Body, Controller, Logger, Post, UseGuards } from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoAgentsService } from './dimo-agents.service';
import { DimoAgentUseCase } from './dimo-agent-use-case.types';

export class DimoAgentDiagnosticsDto {
  /** SynqDrive vehicle UUID — resolves `dimoTokenId` when set. */
  vehicleId?: string;
  /** Explicit DIMO NFT tokenId for optional scoped vehicle test. */
  dimoTokenId?: number;
  /** Use case for ephemeral diagnostic agent (default: vehicle_specs). */
  useCase?: DimoAgentUseCase;
  /** Config-only probe — skips create/message/stream live tests. */
  skipLiveTests?: boolean;
}

/**
 * Master-admin diagnostics for the DIMO AI Agents layer only.
 * Does not expose secrets, JWTs, or API keys.
 */
@Controller('admin/dimo/agents')
@UseGuards(RolesGuard)
@Roles('MASTER_ADMIN')
export class DimoAgentsAdminController {
  private readonly logger = new Logger(DimoAgentsAdminController.name);

  constructor(
    private readonly agentsService: DimoAgentsService,
    private readonly prisma: PrismaService,
  ) {}

  /** POST /api/v1/admin/dimo/agents/diagnostics */
  @Post('diagnostics')
  async runDiagnostics(@Body() body: DimoAgentDiagnosticsDto = {}) {
    const dimoTokenId = await this.resolveDimoTokenId(body);
    this.logger.log(
      `[AgentsDiag] run — skipLive=${Boolean(body.skipLiveTests)} tokenId=${dimoTokenId ?? 'none'}`,
    );
    return this.agentsService.runAgentDiagnostics({
      dimoTokenId,
      useCase: body.useCase,
      skipLiveTests: body.skipLiveTests,
    });
  }

  private async resolveDimoTokenId(body: DimoAgentDiagnosticsDto): Promise<number | undefined> {
    if (typeof body.dimoTokenId === 'number' && !Number.isNaN(body.dimoTokenId)) {
      return body.dimoTokenId;
    }
    if (!body.vehicleId?.trim()) return undefined;

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: body.vehicleId.trim() },
      select: { dimoVehicle: { select: { tokenId: true } } },
    });
    return vehicle?.dimoVehicle?.tokenId ?? undefined;
  }
}

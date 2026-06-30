import { Controller, Get, Logger, UseGuards } from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { DimoAgentsService } from './dimo-agents.service';

/**
 * Lightweight DIMO Agents connectivity probe — DNS + unauthenticated HTTP health only.
 * Does not create agents, send messages, or expose secrets.
 */
@Controller('dimo/agents')
@UseGuards(RolesGuard)
@Roles('MASTER_ADMIN')
export class DimoAgentsHealthController {
  private readonly logger = new Logger(DimoAgentsHealthController.name);

  constructor(private readonly agentsService: DimoAgentsService) {}

  /** GET /api/v1/dimo/agents/health */
  @Get('health')
  async checkHealth() {
    this.logger.log('[AgentsHealth] connectivity probe');
    return this.agentsService.checkDimoAgentsConnectivity();
  }
}

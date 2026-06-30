import { Controller, Get, Post, Query, Param, Body, Logger, Res } from '@nestjs/common';
import { Response } from 'express';
import { DimoAgentsService } from './dimo-agents.service';
import { AiTireSpecJobService, StartAiTireSpecJobInput } from './ai-tire-spec-job.service';
import { PrismaService } from '@shared/database/prisma.service';

@Controller('vehicles/register')
export class DimoAgentsController {
  private readonly logger = new Logger(DimoAgentsController.name);

  constructor(
    private readonly agentsService: DimoAgentsService,
    private readonly tireSpecJobService: AiTireSpecJobService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Legacy synchronous endpoint (kept for fallback) ──────────

  @Get('ai-specs')
  async getAiSpecs(
    @Query('vin') vin?: string,
    @Query('tokenId') tokenIdParam?: string,
    @Query('dimoVehicleId') dimoVehicleId?: string,
    @Query('make') make?: string,
    @Query('model') model?: string,
    @Query('year') yearParam?: string,
  ) {
    if (!this.agentsService.isConfigured()) {
      return {
        success: false, degraded: true, configFailure: true,
        specs: null, steps: [{ step: 'Configuration check', status: 'error', detail: 'DIMO_API_KEY or DIMO_AGENT_USER_WALLET not set' }],
        message: 'DIMO Agent API not configured',
      };
    }

    const { tokenIds, resolvedVin, resolvedMake, resolvedModel, resolvedYear, drivetrain } =
      await this.resolveVehicleParams(vin, tokenIdParam, dimoVehicleId, make, model, yearParam);

    const result = await this.agentsService.getVehicleSpecs(
      tokenIds.length > 0 ? tokenIds : undefined,
      { vin: resolvedVin, make: resolvedMake, model: resolvedModel, year: resolvedYear, drivetrain },
    );

    if (result.success) {
      const hasData = result.specs && Object.values(result.specs).some(v => v !== null);
      return {
        success: true,
        degraded: !hasData || result.knowledgeOnlyFallback,
        configFailure: false,
        agentId: result.agentId,
        specs: result.specs ?? {},
        rawResponse: result.rawResponse,
        steps: result.steps,
        dimoVehicleConnected: result.dimoVehicleConnected,
        knowledgeOnlyFallback: result.knowledgeOnlyFallback,
        message: result.knowledgeOnlyFallback
          ? 'No DIMO tokenId — specs from knowledge-only fallback (not live telemetry)'
          : hasData
            ? undefined
            : 'Agent responded but no structured specs were extracted',
      };
    }

    return {
      success: false, degraded: true, configFailure: result.configFailure ?? false,
      specs: null, steps: result.steps, message: result.error ?? 'Agent request failed',
    };
  }

  // ─── SSE streaming endpoint — primary path for frontend ───────

  @Get('ai-specs-stream')
  async getAiSpecsStream(
    @Res() res: Response,
    @Query('vin') vin?: string,
    @Query('tokenId') tokenIdParam?: string,
    @Query('dimoVehicleId') dimoVehicleId?: string,
    @Query('make') make?: string,
    @Query('model') model?: string,
    @Query('year') yearParam?: string,
    @Query('powertrainType') powertrainType?: string,
    @Query('fuelType') fuelType?: string,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    if (!this.agentsService.isConfigured()) {
      send('error', { message: 'DIMO Agent API not configured', configFailure: true });
      res.end();
      return;
    }

    const { tokenIds, resolvedVin, resolvedMake, resolvedModel, resolvedYear, drivetrain } =
      await this.resolveVehicleParams(vin, tokenIdParam, dimoVehicleId, make, model, yearParam);

    const closed = { value: false };
    res.on('close', () => { closed.value = true; });

    const safeSend = (event: string, data: unknown) => {
      if (!closed.value) send(event, data);
    };

    try {
      await this.agentsService.getVehicleSpecsStream(
        tokenIds.length > 0 ? tokenIds : undefined,
        { vin: resolvedVin, make: resolvedMake, model: resolvedModel, year: resolvedYear, drivetrain, powertrainType, fuelType },
        safeSend,
      );
    } catch (err: any) {
      this.logger.error(`[Agents] Stream orchestration error: ${err?.message}`);
      safeSend('error', { message: err?.message ?? 'Internal error' });
    }

    if (!closed.value) res.end();
  }

  // ─── AI Tire Spec SSE streaming endpoint ─────────────────────

  @Get('ai-tire-specs-stream')
  async getAiTireSpecsStream(
    @Res() res: Response,
    @Query('brand') brand?: string,
    @Query('model') model?: string,
    @Query('year') yearParam?: string,
    @Query('tireSize') tireSize?: string,
    @Query('loadIndex') loadIndex?: string,
    @Query('speedIndex') speedIndex?: string,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    if (!this.agentsService.isConfigured()) {
      send('error', { message: 'DIMO Agent API not configured', configFailure: true });
      res.end();
      return;
    }

    const closed = { value: false };
    res.on('close', () => { closed.value = true; });

    const safeSend = (event: string, data: unknown) => {
      if (!closed.value) send(event, data);
    };

    const year = yearParam ? parseInt(yearParam, 10) : undefined;

    try {
      await this.agentsService.getTireSpecsStream(
        { brand, model, year, tireSize, loadIndex, speedIndex },
        safeSend,
      );
    } catch (err: any) {
      this.logger.error(`[Agents] Tire spec stream error: ${err?.message}`);
      safeSend('error', { message: err?.message ?? 'Internal error' });
    }

    if (!closed.value) res.end();
  }

  // ─── AI Tire Spec Job: start ─────────────────────────────────

  @Post('ai-tire-specs')
  async startAiTireSpecJob(
    @Body() body: StartAiTireSpecJobInput,
  ) {
    this.logger.log(`[AiTireSpec] Start request — ${body.brand} ${body.model} ${body.tireSize}`);
    return this.tireSpecJobService.startJob(body);
  }

  // ─── AI Tire Spec Job: poll status ──────────────────────────

  @Get('ai-tire-specs/:jobId/status')
  async getAiTireSpecJobStatus(
    @Param('jobId') jobId: string,
  ) {
    return this.tireSpecJobService.getJobStatus(jobId);
  }

  // ─── Shared param resolution ──────────────────────────────────

  private async resolveVehicleParams(
    vin?: string, tokenIdParam?: string, dimoVehicleId?: string,
    make?: string, model?: string, yearParam?: string,
  ) {
    const tokenIds: number[] = [];
    let resolvedVin = vin;
    let resolvedMake = make;
    let resolvedModel = model;
    let resolvedYear = yearParam ? parseInt(yearParam, 10) : undefined;
    const drivetrain: string | undefined = undefined;

    if (tokenIdParam) {
      const n = parseInt(tokenIdParam, 10);
      if (!isNaN(n)) tokenIds.push(n);
    }

    if (tokenIds.length === 0 && (dimoVehicleId || vin)) {
      try {
        const where: Record<string, unknown> = {};
        if (dimoVehicleId) where.id = dimoVehicleId;
        else if (vin) where.vin = vin;

        const dv = await this.prisma.dimoVehicle.findFirst({
          where,
          select: { tokenId: true, vin: true, make: true, model: true, year: true },
        });
        if (dv?.tokenId) {
          tokenIds.push(dv.tokenId);
          this.logger.log(`[Agents] Resolved tokenId=${dv.tokenId} from DB`);
        }
        if (dv?.vin && !resolvedVin) resolvedVin = dv.vin;
        if (dv?.make && !resolvedMake) resolvedMake = dv.make as string;
        if (dv?.model && !resolvedModel) resolvedModel = dv.model as string;
        if (dv?.year && !resolvedYear) resolvedYear = dv.year as number;
      } catch (err: any) {
        this.logger.warn(`[Agents] DB lookup failed: ${err?.message}`);
      }
    }

    return { tokenIds, resolvedVin, resolvedMake, resolvedModel, resolvedYear, drivetrain };
  }
}

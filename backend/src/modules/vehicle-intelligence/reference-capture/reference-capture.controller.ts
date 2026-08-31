import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { ReferenceCaptureSessionService } from './reference-capture-session.service';
import { ReferenceCaptureRetentionService } from './reference-capture-retention.service';

@Controller('organizations/:orgId/vehicles/:vehicleId/reference-capture')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class ReferenceCaptureController {
  constructor(
    private readonly sessionService: ReferenceCaptureSessionService,
    private readonly retentionService: ReferenceCaptureRetentionService,
  ) {}

  @Post('sessions')
  @RequirePermission('fleet-condition', 'write')
  createSession(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: { groundTruthVideoRef?: string | null },
  ) {
    return this.sessionService.createSession({
      organizationId: orgId,
      vehicleId,
      groundTruthVideoRef: body?.groundTruthVideoRef ?? null,
    });
  }

  @Get('sessions/:sessionId')
  @RequirePermission('fleet-condition', 'read')
  getSession(
    @Param('orgId') orgId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.sessionService.getSession(orgId, sessionId);
  }

  @Post('sessions/:sessionId/preflight')
  @RequirePermission('fleet-condition', 'write')
  runPreflight(
    @Param('orgId') orgId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.sessionService.runPreflight(orgId, sessionId);
  }

  @Post('sessions/:sessionId/start')
  @RequirePermission('fleet-condition', 'write')
  startRecording(
    @Param('orgId') orgId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.sessionService.startRecording(orgId, sessionId);
  }

  @Post('sessions/:sessionId/tick')
  @RequirePermission('fleet-condition', 'write')
  captureTick(
    @Param('orgId') orgId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.sessionService.captureTick(orgId, sessionId);
  }

  @Post('sessions/:sessionId/stop')
  @RequirePermission('fleet-condition', 'write')
  stopRecording(
    @Param('orgId') orgId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.sessionService.stopRecording(orgId, sessionId);
  }

  @Post('sessions/:sessionId/abort')
  @RequirePermission('fleet-condition', 'write')
  abortSession(
    @Param('orgId') orgId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: { reason?: string },
  ) {
    return this.sessionService.abortSession(orgId, sessionId, body?.reason);
  }

  @Get('sessions/:sessionId/observations')
  @RequirePermission('fleet-condition', 'read')
  listObservations(
    @Param('orgId') orgId: string,
    @Param('sessionId') sessionId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.sessionService.listObservations(orgId, sessionId, {
      limit: limit ? Number.parseInt(limit, 10) : 100,
      offset: offset ? Number.parseInt(offset, 10) : 0,
    });
  }

  @Get('retention-policy')
  @RequirePermission('fleet-condition', 'read')
  getRetentionPolicy(@Query('broadFieldCount') broadFieldCount?: string) {
    const count = broadFieldCount ? Number.parseInt(broadFieldCount, 10) : 80;
    return {
      retention: this.retentionService.getRetentionPolicy(count),
      stressEstimate: this.retentionService.getStressEstimate(count),
    };
  }
}

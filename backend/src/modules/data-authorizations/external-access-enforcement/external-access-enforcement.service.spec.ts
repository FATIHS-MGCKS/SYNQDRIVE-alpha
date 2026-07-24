import {
  AUTHORIZATION_DECISION_OUTCOME,
} from '../authorization-decision-engine/authorization-decision.constants';
import { ExternalAccessEnforcementMetricsService } from './external-access-enforcement.metrics';
import { ExternalAccessEnforcementService } from './external-access-enforcement.service';
import {
  EXTERNAL_ACCESS_DENY_REASON,
  EXTERNAL_ACCESS_SERVICE_IDENTITY,
} from './external-access-enforcement.constants';

describe('ExternalAccessEnforcementService', () => {
  let prisma: {
    vehicle: { findFirst: jest.Mock };
  };
  let authorizationDecision: { decide: jest.Mock };
  let auditService: { recordIngestionSkipped: jest.Mock };
  let healthEnforcement: { mayUseForAi: jest.Mock; mayExport: jest.Mock };
  let behaviorEnforcement: { mayUseForAi: jest.Mock };
  let tripLocationEnforcement: { assertExport: jest.Mock };
  let liveGpsEnforcement: { isVehicleGpsReadAllowed: jest.Mock };
  let mcpRevoker: { revokeConversationTokens: jest.Mock };
  let metrics: ExternalAccessEnforcementMetricsService;
  let service: ExternalAccessEnforcementService;

  beforeEach(() => {
    prisma = {
      vehicle: { findFirst: jest.fn().mockResolvedValue({ id: 'veh-1' }) },
    };
    authorizationDecision = {
      decide: jest.fn().mockResolvedValue({ decision: AUTHORIZATION_DECISION_OUTCOME.ALLOW }),
    };
    auditService = { recordIngestionSkipped: jest.fn().mockResolvedValue('audit-1') };
    healthEnforcement = {
      mayUseForAi: jest.fn().mockResolvedValue(true),
      mayExport: jest.fn().mockResolvedValue(true),
    };
    behaviorEnforcement = { mayUseForAi: jest.fn().mockResolvedValue(true) };
    tripLocationEnforcement = {
      assertExport: jest.fn().mockResolvedValue({ mayProceed: true }),
    };
    liveGpsEnforcement = { isVehicleGpsReadAllowed: jest.fn().mockResolvedValue(true) };
    mcpRevoker = { revokeConversationTokens: jest.fn().mockResolvedValue(2) };
    metrics = new ExternalAccessEnforcementMetricsService();
    service = new ExternalAccessEnforcementService(
      prisma as never,
      authorizationDecision as never,
      auditService as unknown as never,
      metrics,
      healthEnforcement as never,
      behaviorEnforcement as never,
      tripLocationEnforcement as never,
      liveGpsEnforcement as never,
      mcpRevoker,
    );
    process.env.DATA_AUTH_EXTERNAL_ACCESS_SHADOW_MODE = 'false';
    process.env.DATA_AUTH_EXTERNAL_ACCESS_FAIL_CLOSED = 'true';
  });

  afterEach(() => {
    metrics.reset();
    delete process.env.DATA_AUTH_EXTERNAL_ACCESS_SHADOW_MODE;
    delete process.env.DATA_AUTH_EXTERNAL_ACCESS_FAIL_CLOSED;
  });

  it('EXPORT ALLOW — explicit export gate passes via health enforcement', async () => {
    const result = await service.checkExport({
      organizationId: 'org-1',
      channelKey: 'vehicle_file_summary',
      vehicleId: 'veh-1',
      correlationId: 'corr-export-1',
    });
    expect(result.mayProceed).toBe(true);
    expect(healthEnforcement.mayExport).toHaveBeenCalled();
  });

  it('EXPORT DENY — health export blocked', async () => {
    healthEnforcement.mayExport.mockResolvedValue(false);
    const result = await service.checkExport({
      organizationId: 'org-1',
      channelKey: 'vehicle_file_summary',
      vehicleId: 'veh-1',
      correlationId: 'corr-export-deny',
    });
    expect(result.mayProceed).toBe(false);
    expect(result.reasonCode).toBe(EXTERNAL_ACCESS_DENY_REASON.EXPORT_DENIED);
    expect(auditService.recordIngestionSkipped).toHaveBeenCalled();
  });

  it('USE_FOR_AI ALLOW — fleet chat uses explicit categories', async () => {
    const result = await service.checkUseForAi({
      organizationId: 'org-1',
      channelKey: 'fleet_chat',
      correlationId: 'corr-ai-1',
    });
    expect(result.mayProceed).toBe(true);
    expect(healthEnforcement.mayUseForAi).toHaveBeenCalled();
  });

  it('USE_FOR_AI DENY — document extraction blocked', async () => {
    authorizationDecision.decide.mockResolvedValue({
      decision: AUTHORIZATION_DECISION_OUTCOME.DENY,
    });
    const result = await service.checkUseForAi({
      organizationId: 'org-1',
      channelKey: 'document_ai_extraction',
      correlationId: 'corr-ai-deny',
    });
    expect(result.mayProceed).toBe(false);
    expect(result.reasonCode).toBe(EXTERNAL_ACCESS_DENY_REASON.AI_DENIED);
  });

  it('MCP READ — server maps tool to fixed categories (agent cannot choose scope)', async () => {
    const result = await service.checkMcpTool({
      organizationId: 'org-1',
      toolName: 'get_vehicle_status',
      vehicleId: 'veh-1',
      conversationId: 'conv-1',
      correlationId: 'corr-mcp-1',
    });
    expect(result.mayProceed).toBe(true);
    expect(result.spec?.minimization?.deniedFields).toContain('latitude');
    expect(liveGpsEnforcement.isVehicleGpsReadAllowed).toHaveBeenCalled();
  });

  it('MCP DENY — unknown tool rejected', async () => {
    const result = await service.checkMcpTool({
      organizationId: 'org-1',
      toolName: 'unknown_tool',
      conversationId: 'conv-1',
      correlationId: 'corr-mcp-unknown',
    });
    expect(result.mayProceed).toBe(false);
    expect(result.spec).toBeNull();
    expect(result.reasonCode).toBe(EXTERNAL_ACCESS_DENY_REASON.MCP_DENIED);
  });

  it('SHARE — partner access uses EXTERNAL_PARTNER processor', async () => {
    await service.checkShare({
      organizationId: 'org-1',
      channel: 'PARTNER_API',
      action: 'SHARE',
      dataCategories: ['CUSTOMER_DATA'],
      purpose: 'PARTNER_SERVICE',
      processingPath: 'partner-api-egress',
      serviceIdentity: EXTERNAL_ACCESS_SERVICE_IDENTITY.PARTNER_API,
      correlationId: 'corr-share-1',
      externalRecipient: 'partner-acme',
    });
    expect(authorizationDecision.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SHARE',
        processorType: 'EXTERNAL_PARTNER',
      }),
    );
  });

  it('WEBHOOK — recipient and purpose checked via SHARE action', async () => {
    const result = await service.checkWebhookEgress({
      organizationId: 'org-1',
      externalRecipient: 'https://hooks.partner.example/events',
      correlationId: 'corr-webhook-1',
    });
    expect(result.mayProceed).toBe(true);
    expect(authorizationDecision.decide).toHaveBeenCalled();
  });

  it('BULK EXPORT DENY — requires org allowlist entry', async () => {
    delete process.env.DATA_AUTH_BULK_EXPORT_ORG_ALLOWLIST;
    const result = await service.checkExport({
      organizationId: 'org-1',
      channelKey: 'bulk_export',
      bulkExport: true,
      correlationId: 'corr-bulk-deny',
    });
    expect(result.mayProceed).toBe(false);
    expect(result.reasonCode).toBe(EXTERNAL_ACCESS_DENY_REASON.BULK_EXPORT_DENIED);
    expect(healthEnforcement.mayExport).not.toHaveBeenCalled();
  });

  it('SUPPORT — requires master admin support identity', async () => {
    const denied = await service.checkSupportAccess({
      organizationId: 'org-1',
      serviceIdentity: 'synqdrive-fleet-chat-ai',
      correlationId: 'corr-support-bad',
      dataCategories: ['HEALTH_SIGNALS'],
      purpose: 'VEHICLE_HEALTH',
    });
    expect(denied.mayProceed).toBe(false);
    expect(denied.reasonCode).toBe(EXTERNAL_ACCESS_DENY_REASON.SUPPORT_DENIED);

    const allowed = await service.checkSupportAccess({
      organizationId: 'org-1',
      serviceIdentity: EXTERNAL_ACCESS_SERVICE_IDENTITY.MASTER_ADMIN_SUPPORT,
      correlationId: 'corr-support-ok',
      dataCategories: ['HEALTH_SIGNALS'],
      purpose: 'TECHNICAL_OVERVIEW',
      vehicleId: 'veh-1',
    });
    expect(allowed.mayProceed).toBe(true);
  });

  it('Multi-Tenant — foreign vehicle denied', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);
    const result = await service.checkExport({
      organizationId: 'org-1',
      channelKey: 'vehicle_file_summary',
      vehicleId: 'veh-foreign',
      correlationId: 'corr-tenant',
    });
    expect(result.mayProceed).toBe(false);
    expect(result.reasonCode).toBe(EXTERNAL_ACCESS_DENY_REASON.TENANT_MISMATCH);
  });

  it('Revocation — invalidates MCP conversation tokens', async () => {
    const result = await service.handleRevocation({
      organizationId: 'org-1',
      conversationId: 'conv-1',
      correlationId: 'corr-revoke-1',
    });
    expect(result.revokedTokens).toBe(2);
    expect(mcpRevoker.revokeConversationTokens).toHaveBeenCalledWith('conv-1');
    expect(metrics.countFor('MCP_TOOL', 'READ', 'revoked')).toBe(1);
  });

  it('Export is not implied by READ — uses EXPORT action in health path', async () => {
    await service.checkExport({
      organizationId: 'org-1',
      channelKey: 'generated_document_download',
      correlationId: 'corr-doc-export',
      resourceId: 'doc-1',
    });
    expect(authorizationDecision.decide).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EXPORT' }),
    );
  });
});

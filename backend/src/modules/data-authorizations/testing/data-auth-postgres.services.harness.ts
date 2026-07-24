import type { PrismaClient } from '@prisma/client';
import { AuthorizationDecisionService } from '../authorization-decision-engine/authorization-decision.service';
import { PolicyResolverService } from '../policy-resolver/policy-resolver.service';
import { DataAuthorizationAuditOutboxMetricsService } from '../privacy-domain/audit-log/data-authorization-audit-outbox.metrics';
import { DataAuthorizationAuditOutboxProcessorService } from '../privacy-domain/audit-log/data-authorization-audit-outbox.processor';
import { DataAuthorizationAuditOutboxRepository } from '../privacy-domain/audit-log/data-authorization-audit-outbox.repository';
import { DataAuthorizationAuditService } from '../privacy-domain/audit-log/data-authorization-audit.service';

export type DataAuthPostgresServices = {
  policyResolver: PolicyResolverService;
  auditService: DataAuthorizationAuditService;
  decisionService: AuthorizationDecisionService;
  outboxProcessor: DataAuthorizationAuditOutboxProcessorService;
};

export function buildDataAuthPostgresServices(prisma: PrismaClient): DataAuthPostgresServices {
  const policyResolver = new PolicyResolverService(prisma as never);
  const outboxRepo = new DataAuthorizationAuditOutboxRepository(prisma as never);
  const outboxMetrics = new DataAuthorizationAuditOutboxMetricsService();
  const outboxProcessor = new DataAuthorizationAuditOutboxProcessorService(
    prisma as never,
    outboxRepo,
    outboxMetrics,
  );
  const auditService = new DataAuthorizationAuditService(
    prisma as never,
    outboxRepo,
    outboxProcessor,
  );
  const decisionService = new AuthorizationDecisionService(policyResolver, auditService);
  return { policyResolver, auditService, decisionService, outboxProcessor };
}

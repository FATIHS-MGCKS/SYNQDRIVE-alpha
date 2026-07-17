/**
 * Voice staging E2E scenario registry (Prompt 10B).
 * Source of truth for automated coverage vs manual staging runs.
 */

export type VoiceStagingScenarioTier =
  | 'unit'
  | 'integration-mock'
  | 'ci-mock'
  | 'preflight'
  | 'e2e-manual-live'
  | 'e2e-manual-failure';

export interface VoiceStagingE2eScenario {
  id: number;
  key: string;
  title: string;
  tier: VoiceStagingScenarioTier;
  /** Jest/Vitest/Playwright spec paths (repo-relative) */
  automatedTests: string[];
  /** Manual procedure reference in docs/testing/voice-ai-e2e-test-matrix.md */
  manualSection: string;
  /** Requires VOICE_E2E_ALLOW_LIVE_CALLS + allowlist */
  requiresLiveCalls: boolean;
  /** Safe to run in CI without provider network */
  ciSafe: boolean;
  /** Functional area for readiness report grouping */
  area:
    | 'preflight'
    | 'provisioning'
    | 'agent'
    | 'telephony'
    | 'mcp'
    | 'webhooks'
    | 'billing'
    | 'protection'
    | 'resilience'
    | 'data'
    | 'canary'
    | 'rollback'
    | 'ui';
}

export const VOICE_STAGING_SCENARIO_COUNT = 28;

export const VOICE_STAGING_E2E_SCENARIOS: VoiceStagingE2eScenario[] = [
  {
    id: 1,
    key: 'preflight-branch-migrations',
    title: 'Preflight — Branch, Commit, Migrationen',
    tier: 'preflight',
    automatedTests: ['backend/scripts/ops/voice-staging-preflight.sh'],
    manualSection: '§2.1',
    requiresLiveCalls: false,
    ciSafe: true,
    area: 'preflight',
  },
  {
    id: 2,
    key: 'preflight-feature-flags',
    title: 'Preflight — Feature Flags & Staging-Org',
    tier: 'preflight',
    automatedTests: [
      'backend/src/modules/voice-assistant/e2e/voice-e2e.config.spec.ts',
      'backend/src/modules/voice-call-orchestration/voice-call-orchestration.spec.ts',
    ],
    manualSection: '§2.2',
    requiresLiveCalls: false,
    ciSafe: true,
    area: 'preflight',
  },
  {
    id: 3,
    key: 'preflight-twilio-ie1-webhooks',
    title: 'Preflight — Twilio IE1/Dublin & Webhook Reachability',
    tier: 'preflight',
    automatedTests: ['backend/scripts/ops/twilio-webhook-reachability.sh'],
    manualSection: '§2.3',
    requiresLiveCalls: false,
    ciSafe: false,
    area: 'preflight',
  },
  {
    id: 4,
    key: 'provisioning-subaccount-status',
    title: 'Provisioning — Twilio Subaccount & Regulatory',
    tier: 'integration-mock',
    automatedTests: [
      'backend/src/modules/voice-assistant/admin/voice-control-plane-admin.service.spec.ts',
      'frontend/src/master/components/voice-control-plane/voice-control-plane-admin.test.ts',
    ],
    manualSection: '§3.1',
    requiresLiveCalls: false,
    ciSafe: true,
    area: 'provisioning',
  },
  {
    id: 5,
    key: 'agent-deploy-readiness',
    title: 'Agent Deployment — Draft, Diff, Readiness, Deploy',
    tier: 'integration-mock',
    automatedTests: [
      'backend/src/modules/voice-assistant/control-plane/voice-control-plane.repository.spec.ts',
      'backend/src/modules/voice-assistant/voice-conversation-lifecycle.util.spec.ts',
    ],
    manualSection: '§3.2',
    requiresLiveCalls: false,
    ciSafe: true,
    area: 'agent',
  },
  {
    id: 6,
    key: 'phone-number-import-assign',
    title: 'Telefonnummer — Import & Zuordnung',
    tier: 'integration-mock',
    automatedTests: [
      'backend/src/modules/voice-assistant/admin/voice-control-plane-admin.controller.spec.ts',
      'frontend/e2e/voice-control-plane-flow.spec.ts',
    ],
    manualSection: '§3.3',
    requiresLiveCalls: false,
    ciSafe: true,
    area: 'telephony',
  },
  {
    id: 7,
    key: 'mcp-read-tools',
    title: 'MCP Gateway — Read-Tools',
    tier: 'ci-mock',
    automatedTests: [
      'backend/src/modules/voice-mcp-gateway/voice-mcp-tools.service.spec.ts',
      'backend/src/modules/voice-mcp-gateway/voice-mcp-gateway.security.spec.ts',
    ],
    manualSection: '§3.4',
    requiresLiveCalls: false,
    ciSafe: true,
    area: 'mcp',
  },
  {
    id: 8,
    key: 'mcp-controlled-writes',
    title: 'MCP Gateway — kontrollierte Write-Tools & Approvals',
    tier: 'ci-mock',
    automatedTests: [
      'backend/src/modules/voice-mcp-gateway/voice-mcp-write-actions.spec.ts',
      'backend/src/modules/voice-mcp-gateway/voice-mcp-token.service.spec.ts',
    ],
    manualSection: '§3.5',
    requiresLiveCalls: false,
    ciSafe: true,
    area: 'mcp',
  },
  {
    id: 9,
    key: 'webhook-signatures',
    title: 'Webhooks — Signaturvalidierung Twilio/ElevenLabs',
    tier: 'ci-mock',
    automatedTests: [
      'backend/src/modules/voice-webhook-ingestion/voice-webhook-ingestion.util.spec.ts',
      'backend/src/modules/twilio/twilio-webhook.controller.characterization.spec.ts',
    ],
    manualSection: '§3.6',
    requiresLiveCalls: false,
    ciSafe: true,
    area: 'webhooks',
  },
  {
    id: 10,
    key: 'event-correlation',
    title: 'Eventkorrelation — Twilio CallSid ↔ Conversation',
    tier: 'ci-mock',
    automatedTests: [
      'backend/src/modules/voice-assistant/security/voice-tenant-isolation.security.spec.ts',
      'backend/src/modules/voice-webhook-ingestion/voice-webhook-ingestion.pipeline.spec.ts',
    ],
    manualSection: '§3.7',
    requiresLiveCalls: false,
    ciSafe: true,
    area: 'webhooks',
  },
  {
    id: 11,
    key: 'usage-ledger-dedup',
    title: 'Usage Ledger — Metering & Dedup',
    tier: 'unit',
    automatedTests: ['backend/src/modules/voice-billing/voice-billing.spec.ts'],
    manualSection: '§3.8',
    requiresLiveCalls: false,
    ciSafe: true,
    area: 'billing',
  },
  {
    id: 12,
    key: 'budget-limit-enforcement',
    title: 'Budget & Call-Limit — Enforcement',
    tier: 'integration-mock',
    automatedTests: ['backend/src/modules/voice-protection/voice-protection.spec.ts'],
    manualSection: '§3.9',
    requiresLiveCalls: false,
    ciSafe: true,
    area: 'protection',
  },
  {
    id: 13,
    key: 'cross-tenant-negative',
    title: 'Cross-Tenant — Negativtest',
    tier: 'ci-mock',
    automatedTests: [
      'backend/src/modules/voice-assistant/security/voice-tenant-isolation.security.spec.ts',
      'backend/src/shared/auth/org-scoping.voice.characterization.spec.ts',
    ],
    manualSection: '§3.10',
    requiresLiveCalls: false,
    ciSafe: true,
    area: 'data',
  },
  {
    id: 14,
    key: 'live-inbound-greeting',
    title: 'Live Staging — Inbound Begrüßung & Kundenerkennung',
    tier: 'e2e-manual-live',
    automatedTests: ['frontend/e2e/voice-staging-live.spec.ts'],
    manualSection: '§4.1',
    requiresLiveCalls: true,
    ciSafe: false,
    area: 'telephony',
  },
  {
    id: 15,
    key: 'live-inbound-booking-fallback',
    title: 'Live Staging — Buchungsabfrage & Mitarbeiter-Fallback',
    tier: 'e2e-manual-live',
    automatedTests: ['frontend/e2e/voice-staging-live.spec.ts'],
    manualSection: '§4.2',
    requiresLiveCalls: true,
    ciSafe: false,
    area: 'telephony',
  },
  {
    id: 16,
    key: 'live-outbound-user',
    title: 'Live Staging — User-initiierter Outbound',
    tier: 'e2e-manual-live',
    automatedTests: ['frontend/e2e/voice-staging-live.spec.ts'],
    manualSection: '§4.3',
    requiresLiveCalls: true,
    ciSafe: false,
    area: 'telephony',
  },
  {
    id: 17,
    key: 'live-outbound-no-answer',
    title: 'Live Staging — No Answer / Busy / Max Duration',
    tier: 'e2e-manual-live',
    automatedTests: ['frontend/e2e/voice-staging-live.spec.ts'],
    manualSection: '§4.4',
    requiresLiveCalls: true,
    ciSafe: false,
    area: 'telephony',
  },
  {
    id: 18,
    key: 'provider-elevenlabs-down',
    title: 'Providerstörung — ElevenLabs nicht erreichbar',
    tier: 'e2e-manual-failure',
    automatedTests: ['backend/src/modules/voice-assistant/security/voice-resilience.security.spec.ts'],
    manualSection: '§5.1',
    requiresLiveCalls: false,
    ciSafe: true,
    area: 'resilience',
  },
  {
    id: 19,
    key: 'provider-twilio-error',
    title: 'Providerstörung — Twilio Fehler',
    tier: 'e2e-manual-failure',
    automatedTests: ['backend/src/modules/voice-assistant/security/voice-resilience.security.spec.ts'],
    manualSection: '§5.2',
    requiresLiveCalls: false,
    ciSafe: true,
    area: 'resilience',
  },
  {
    id: 20,
    key: 'mcp-timeout-retry',
    title: 'MCP Timeout & Queue Retry',
    tier: 'ci-mock',
    automatedTests: [
      'backend/src/modules/voice-mcp-gateway/voice-mcp-rate-limit.service.spec.ts',
      'backend/src/modules/voice-assistant/security/voice-resilience.security.spec.ts',
    ],
    manualSection: '§5.3',
    requiresLiveCalls: false,
    ciSafe: true,
    area: 'resilience',
  },
  {
    id: 21,
    key: 'webhook-dlq-replay',
    title: 'Webhook DLQ & Replay',
    tier: 'integration-mock',
    automatedTests: [
      'backend/src/modules/voice-assistant/control-plane/voice-audit-persistence.repository.spec.ts',
      'backend/src/modules/voice-assistant/admin/voice-control-plane-admin.service.spec.ts',
    ],
    manualSection: '§5.4',
    requiresLiveCalls: false,
    ciSafe: true,
    area: 'webhooks',
  },
  {
    id: 22,
    key: 'failed-transfer-budget',
    title: 'Fehlgeschlagener Transfer & Budget erreicht',
    tier: 'integration-mock',
    automatedTests: ['backend/src/modules/voice-protection/voice-protection.spec.ts'],
    manualSection: '§5.5',
    requiresLiveCalls: false,
    ciSafe: true,
    area: 'protection',
  },
  {
    id: 23,
    key: 'data-conversation-record',
    title: 'Datenprüfung — Conversation & Korrelation',
    tier: 'ci-mock',
    automatedTests: [
      'backend/src/modules/voice-assistant/voice-conversation.util.spec.ts',
      'backend/src/modules/voice-assistant/security/voice-structured-log.util.spec.ts',
    ],
    manualSection: '§6.1',
    requiresLiveCalls: false,
    ciSafe: true,
    area: 'data',
  },
  {
    id: 24,
    key: 'data-tool-audit-privacy',
    title: 'Datenprüfung — Tool Executions, keine Secrets/PII',
    tier: 'ci-mock',
    automatedTests: [
      'backend/src/modules/voice-mcp-gateway/voice-mcp-privacy.util.spec.ts',
      'backend/src/modules/voice-assistant/security/voice-retention.service.spec.ts',
      'backend/src/modules/observability/voice-metrics.service.spec.ts',
    ],
    manualSection: '§6.2',
    requiresLiveCalls: false,
    ciSafe: true,
    area: 'data',
  },
  {
    id: 25,
    key: 'canary-staging-org',
    title: 'Canary — interne Staging-Organisation',
    tier: 'e2e-manual-live',
    automatedTests: ['backend/src/modules/voice-assistant/e2e/voice-e2e.config.spec.ts'],
    manualSection: '§7.1',
    requiresLiveCalls: false,
    ciSafe: true,
    area: 'canary',
  },
  {
    id: 26,
    key: 'canary-test-org-flags',
    title: 'Canary — Testorganisation & tenantweise Flags',
    tier: 'e2e-manual-live',
    automatedTests: ['docs/runbooks/voice-ai-production-release.md'],
    manualSection: '§7.2',
    requiresLiveCalls: false,
    ciSafe: false,
    area: 'canary',
  },
  {
    id: 27,
    key: 'rollback-flags-agent-number',
    title: 'Rollback — Flags, Agentversion, Nummernzuordnung',
    tier: 'integration-mock',
    automatedTests: [
      'backend/src/modules/voice-assistant/admin/voice-control-plane-admin.service.spec.ts',
      'frontend/src/master/components/voice-control-plane/voice-control-plane-admin.test.ts',
    ],
    manualSection: '§8.1',
    requiresLiveCalls: false,
    ciSafe: true,
    area: 'rollback',
  },
  {
    id: 28,
    key: 'control-plane-ui-master',
    title: 'Master Control Plane UI — Navigation & Secure Actions',
    tier: 'integration-mock',
    automatedTests: [
      'frontend/src/master/components/voice-control-plane/voice-control-plane-admin.test.ts',
      'frontend/e2e/voice-control-plane-flow.spec.ts',
    ],
    manualSection: '§3.11',
    requiresLiveCalls: false,
    ciSafe: true,
    area: 'ui',
  },
];

export function ciSafeVoiceScenarios(): VoiceStagingE2eScenario[] {
  return VOICE_STAGING_E2E_SCENARIOS.filter((scenario) => scenario.ciSafe);
}

export function liveVoiceScenarios(): VoiceStagingE2eScenario[] {
  return VOICE_STAGING_E2E_SCENARIOS.filter((scenario) => scenario.requiresLiveCalls);
}

export function voiceScenariosByTier(tier: VoiceStagingScenarioTier): VoiceStagingE2eScenario[] {
  return VOICE_STAGING_E2E_SCENARIOS.filter((scenario) => scenario.tier === tier);
}

export function voiceScenariosByArea(area: VoiceStagingE2eScenario['area']): VoiceStagingE2eScenario[] {
  return VOICE_STAGING_E2E_SCENARIOS.filter((scenario) => scenario.area === area);
}

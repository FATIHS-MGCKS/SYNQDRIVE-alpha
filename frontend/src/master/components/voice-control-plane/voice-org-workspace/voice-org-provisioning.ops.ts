import type { VoiceControlPlaneOrgWorkspace } from '../../../../lib/api';

export type VoiceProvisioningStepStatus =
  | 'completed'
  | 'in_progress'
  | 'failed'
  | 'blocked'
  | 'pending'
  | 'not_started';

export interface VoiceProvisioningStepView {
  id: string;
  order: number;
  label: string;
  resource: string;
  status: VoiceProvisioningStepStatus;
  prerequisites: string[];
  lastChangedAt: string | null;
  error: string | null;
  actionLabel: string | null;
  actionKind:
    | 'refresh'
    | 'retry_twilio'
    | 'retry_import'
    | 'deploy_agent'
    | 'replay_webhook'
    | null;
  relatedJobId: string | null;
}

const STEP_DEFS = [
  { id: 'subscription', order: 1, label: 'Voice Subscription', resource: 'VoiceSubscription' },
  { id: 'twilio_subaccount', order: 2, label: 'Twilio Subaccount', resource: 'Twilio ProviderAccount' },
  { id: 'regulatory', order: 3, label: 'Regulatory Setup', resource: 'VoicePhoneNumber.regulatoryStatus' },
  { id: 'phone_number', order: 4, label: 'Phone Number', resource: 'VoicePhoneNumber' },
  { id: 'elevenlabs_agent', order: 5, label: 'ElevenLabs Agent', resource: 'VoiceAgentDeployment' },
  { id: 'number_assignment', order: 6, label: 'Number Assignment', resource: 'ElevenLabs Import' },
  { id: 'mcp_connection', order: 7, label: 'MCP Connection', resource: 'Voice MCP Gateway' },
  { id: 'webhooks', order: 8, label: 'Webhooks', resource: 'VoiceProviderWebhookEvent' },
  { id: 'test', order: 9, label: 'Test', resource: 'VoiceTestRun' },
  { id: 'activation', order: 10, label: 'Activation', resource: 'VoiceAssistant.status' },
] as const;

function findJob(
  workspace: VoiceControlPlaneOrgWorkspace,
  types: string[],
): VoiceControlPlaneOrgWorkspace['provisioningJobs'][number] | null {
  return (
    workspace.provisioningJobs.find(
      job => types.includes(job.jobType) && (job.status === 'FAILED' || job.status === 'RUNNING'),
    ) ??
    workspace.provisioningJobs.find(job => types.includes(job.jobType)) ??
    null
  );
}

function readinessOk(workspace: VoiceControlPlaneOrgWorkspace, key: string): boolean {
  return workspace.detail.readiness?.checks.find(check => check.key === key)?.ok ?? false;
}

function latestJobUpdatedAt(
  workspace: VoiceControlPlaneOrgWorkspace,
  types: string[],
): string | null {
  const jobs = workspace.provisioningJobs.filter(job => types.includes(job.jobType));
  if (jobs.length === 0) return null;
  return jobs.reduce((latest, job) =>
    new Date(job.updatedAt) > new Date(latest.updatedAt) ? job : latest,
  ).updatedAt;
}

export function buildProvisioningSteps(
  workspace: VoiceControlPlaneOrgWorkspace,
): VoiceProvisioningStepView[] {
  const sub = workspace.subscription as { status?: string; updatedAt?: string } | null;
  const subStatus = sub?.status ?? null;
  const twilioAccount = workspace.providerAccounts.find(a => a.provider === 'TWILIO');
  const phone = workspace.phoneNumbers[0] ?? null;
  const assistantStatus = workspace.detail.assistant?.status ?? 'NOT_CONFIGURED';
  const telephony = workspace.detail.telephonyStatus;

  const twilioJob = findJob(workspace, ['TWILIO_SUBACCOUNT_CREATE']);
  const importJob = findJob(workspace, ['ELEVENLABS_NUMBER_IMPORT']);
  const agentJob = findJob(workspace, ['ELEVENLABS_AGENT_CREATE', 'ELEVENLABS_AGENT_UPDATE']);

  const subscriptionCompleted =
    subStatus === 'ACTIVE' || subStatus === 'TRIAL' || subStatus === 'PAST_DUE';
  const subscriptionFailed = subStatus === 'SUSPENDED' || subStatus === 'CANCELLED';

  const twilioCompleted = Boolean(twilioAccount && twilioAccount.status !== 'FAILED');
  const twilioFailed = twilioJob?.status === 'FAILED' || twilioAccount?.status === 'FAILED';

  const regulatoryCompleted =
    phone?.regulatoryStatus === 'APPROVED' || phone?.regulatoryStatus === 'EXEMPT';
  const regulatoryFailed = phone?.regulatoryStatus === 'REJECTED';

  const phoneCompleted = workspace.phoneNumbers.some(n => n.status === 'ACTIVE');
  const agentCompleted =
    Boolean(workspace.detail.assistant?.hasAgent) || Boolean(telephony?.agentProvisioned);
  const assignmentCompleted = workspace.phoneNumbers.some(n => n.elevenLabsAssigned);
  const mcpCompleted = readinessOk(workspace, 'elevenlabs');
  const webhooksCompleted = Boolean(telephony?.inboundReady) || readinessOk(workspace, 'twilio');
  const testCompleted = readinessOk(workspace, 'tests');
  const activationCompleted = assistantStatus === 'ACTIVE';

  const stepStatuses: Record<string, VoiceProvisioningStepStatus> = {
    subscription: subscriptionFailed
      ? 'failed'
      : subscriptionCompleted
        ? 'completed'
        : 'not_started',
    twilio_subaccount: twilioFailed
      ? 'failed'
      : twilioCompleted
        ? 'completed'
        : subscriptionCompleted
          ? 'in_progress'
          : 'blocked',
    regulatory: regulatoryFailed
      ? 'failed'
      : regulatoryCompleted
        ? 'completed'
        : phoneCompleted
          ? 'in_progress'
          : 'blocked',
    phone_number: phoneCompleted ? 'completed' : twilioCompleted ? 'in_progress' : 'blocked',
    elevenlabs_agent: agentJob?.status === 'FAILED'
      ? 'failed'
      : agentCompleted
        ? 'completed'
        : phoneCompleted
          ? 'in_progress'
          : 'blocked',
    number_assignment: importJob?.status === 'FAILED'
      ? 'failed'
      : assignmentCompleted
        ? 'completed'
        : agentCompleted
          ? 'in_progress'
          : 'blocked',
    mcp_connection: mcpCompleted ? 'completed' : assignmentCompleted ? 'in_progress' : 'blocked',
    webhooks: webhooksCompleted ? 'completed' : mcpCompleted ? 'in_progress' : 'blocked',
    test: testCompleted ? 'completed' : webhooksCompleted ? 'in_progress' : 'blocked',
    activation: activationCompleted
      ? 'completed'
      : testCompleted
        ? 'in_progress'
        : 'blocked',
  };

  const stepErrors: Record<string, string | null> = {
    subscription: subscriptionFailed ? 'Voice-Abonnement nicht aktiv' : null,
    twilio_subaccount: twilioJob?.lastError ?? (twilioFailed ? 'Twilio-Subaccount fehlgeschlagen' : null),
    regulatory: regulatoryFailed ? 'Regulatorische Freigabe abgelehnt' : null,
    phone_number: null,
    elevenlabs_agent: agentJob?.lastError ?? null,
    number_assignment: importJob?.lastError ?? null,
    mcp_connection: mcpCompleted ? null : 'ElevenLabs/MCP noch nicht erreichbar',
    webhooks: webhooksCompleted ? null : 'Inbound-Webhooks noch nicht bereit',
    test: testCompleted ? null : 'Testszenarien noch nicht bestanden',
    activation: activationCompleted ? null : null,
  };

  const stepActions: Record<
    string,
    Pick<VoiceProvisioningStepView, 'actionLabel' | 'actionKind' | 'relatedJobId'>
  > = {
    subscription: { actionLabel: null, actionKind: null, relatedJobId: null },
    twilio_subaccount: {
      actionLabel: twilioFailed ? 'Fehlgeschlagenen Schritt erneut versuchen' : null,
      actionKind: twilioFailed ? 'retry_twilio' : null,
      relatedJobId: twilioJob?.id ?? null,
    },
    regulatory: { actionLabel: null, actionKind: null, relatedJobId: null },
    phone_number: { actionLabel: null, actionKind: null, relatedJobId: null },
    elevenlabs_agent: {
      actionLabel: agentJob?.status === 'FAILED' ? 'Agent-Version veröffentlichen' : null,
      actionKind: agentJob?.status === 'FAILED' ? 'deploy_agent' : null,
      relatedJobId: agentJob?.id ?? null,
    },
    number_assignment: {
      actionLabel: importJob?.status === 'FAILED' ? 'Nummer erneut zuordnen' : null,
      actionKind: importJob?.status === 'FAILED' ? 'retry_import' : null,
      relatedJobId: importJob?.id ?? null,
    },
    mcp_connection: { actionLabel: null, actionKind: null, relatedJobId: null },
    webhooks: { actionLabel: null, actionKind: null, relatedJobId: null },
    test: { actionLabel: null, actionKind: null, relatedJobId: null },
    activation: { actionLabel: null, actionKind: null, relatedJobId: null },
  };

  const lastChanged: Record<string, string | null> = {
    subscription: (sub as { updatedAt?: string } | null)?.updatedAt ?? null,
    twilio_subaccount: twilioAccount?.updatedAt ?? latestJobUpdatedAt(workspace, ['TWILIO_SUBACCOUNT_CREATE']),
    regulatory: phone ? workspace.phoneNumbers[0]?.id ? workspace.provisioningJobs[0]?.updatedAt ?? null : null : null,
    phone_number: workspace.phoneNumbers[0] ? workspace.provisioningJobs.find(j => j.jobType.includes('NUMBER'))?.updatedAt ?? null : null,
    elevenlabs_agent: latestJobUpdatedAt(workspace, ['ELEVENLABS_AGENT_CREATE', 'ELEVENLABS_AGENT_UPDATE']),
    number_assignment: latestJobUpdatedAt(workspace, ['ELEVENLABS_NUMBER_IMPORT']),
    mcp_connection: null,
    webhooks: null,
    test: null,
    activation: workspace.detail.assistant?.lastProvisionedAt ?? null,
  };

  return STEP_DEFS.map(def => ({
    id: def.id,
    order: def.order,
    label: def.label,
    resource: def.resource,
    status: stepStatuses[def.id] ?? 'not_started',
    prerequisites: derivePrerequisites(def.id, stepStatuses),
    lastChangedAt: lastChanged[def.id] ?? null,
    error: stepErrors[def.id] ?? null,
    ...stepActions[def.id],
  }));
}

function derivePrerequisites(
  stepId: string,
  statuses: Record<string, VoiceProvisioningStepStatus>,
): string[] {
  const chain: Record<string, string | null> = {
    subscription: null,
    twilio_subaccount: 'subscription',
    regulatory: 'twilio_subaccount',
    phone_number: 'regulatory',
    elevenlabs_agent: 'phone_number',
    number_assignment: 'elevenlabs_agent',
    mcp_connection: 'number_assignment',
    webhooks: 'mcp_connection',
    test: 'webhooks',
    activation: 'test',
  };
  const prereq = chain[stepId];
  if (!prereq) return [];
  const status = statuses[prereq];
  if (status === 'completed') return [];
  const label = STEP_DEFS.find(s => s.id === prereq)?.label ?? prereq;
  return [`${label} muss abgeschlossen sein`];
}

export function provisioningStatusTone(
  status: VoiceProvisioningStepStatus,
): 'success' | 'warning' | 'critical' | 'neutral' | 'noData' {
  switch (status) {
    case 'completed':
      return 'success';
    case 'in_progress':
    case 'pending':
      return 'warning';
    case 'failed':
      return 'critical';
    case 'blocked':
      return 'noData';
    default:
      return 'neutral';
  }
}

export function provisioningStatusLabel(status: VoiceProvisioningStepStatus): string {
  switch (status) {
    case 'completed':
      return 'Abgeschlossen';
    case 'in_progress':
      return 'In Bearbeitung';
    case 'failed':
      return 'Fehlgeschlagen';
    case 'blocked':
      return 'Blockiert';
    case 'pending':
      return 'Ausstehend';
    default:
      return 'Nicht gestartet';
  }
}

export function provisioningProgressPercent(steps: VoiceProvisioningStepView[]): number {
  if (steps.length === 0) return 0;
  const completed = steps.filter(s => s.status === 'completed').length;
  return Math.round((completed / steps.length) * 100);
}

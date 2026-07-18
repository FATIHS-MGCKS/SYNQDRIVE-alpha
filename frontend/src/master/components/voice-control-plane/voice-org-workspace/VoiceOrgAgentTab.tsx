import { StatusChip } from '../../../../components/patterns';
import { VoiceSectionHeader } from '../../../../components/voice-ui';
import type { VoiceControlPlaneOrgWorkspace } from '../../../../lib/api';
import { maskTechnicalId } from './voice-org-workspace.ops';

interface VoiceOrgAgentTabProps {
  workspace: VoiceControlPlaneOrgWorkspace;
  onPublish: () => void;
  onRollback: () => void;
}

export function VoiceOrgAgentTab({ workspace, onPublish, onRollback }: VoiceOrgAgentTabProps) {
  const draft = workspace.agentDeployment.draft as Record<string, unknown> | null;
  const diff = workspace.agentDeployment.diff as Record<string, unknown> | null;
  const assistant = workspace.detail.assistant;
  const hasDraft = Boolean(draft);
  const hasDiff = Boolean(diff);
  const diffCount = Array.isArray((diff as { changes?: unknown[] })?.changes)
    ? (diff as { changes: unknown[] }).changes.length
    : hasDiff
      ? 1
      : 0;

  return (
    <div className="space-y-4" data-testid="voice-org-tab-agent">
      <VoiceSectionHeader
        title="Agent Deployment"
        description="Versionierter Rollout — keine freie Provider-ID-Eingabe."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border p-4 space-y-2">
          <h4 className="text-xs font-semibold">Aktueller Stand</h4>
          <dl className="space-y-1 text-xs">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <StatusChip tone={assistant?.status === 'ACTIVE' ? 'success' : 'warning'}>
                  {assistant?.status ?? 'NOT_CONFIGURED'}
                </StatusChip>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Agent referenziert</dt>
              <dd>{assistant?.hasAgent ? 'Ja' : 'Nein'}</dd>
            </div>
            {assistant?.elevenLabsAgentId && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground shrink-0">Agent-ID</dt>
                <dd className="font-mono text-[10px]">{maskTechnicalId(assistant.elevenLabsAgentId)}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="rounded-xl border border-border p-4 space-y-2">
          <h4 className="text-xs font-semibold">Draft & Diff</h4>
          <p className="text-xs text-muted-foreground">
            Draft: {hasDraft ? 'vorhanden' : 'keiner'} · Änderungen: {diffCount}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={!hasDraft}
              onClick={onPublish}
              className="rounded-lg bg-[color:var(--brand)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              Agent-Version veröffentlichen
            </button>
            <button
              type="button"
              onClick={onRollback}
              className="rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10"
            >
              Rollback (destruktiv)
            </button>
          </div>
        </div>
      </div>

      {hasDiff && (
        <div className="rounded-xl border border-border p-4">
          <h4 className="text-xs font-semibold mb-2">Konfigurationsänderungen (Zusammenfassung)</h4>
          <pre className="max-h-48 overflow-auto rounded-lg bg-muted/40 p-3 text-[10px] font-mono whitespace-pre-wrap">
            {JSON.stringify(diff, null, 2).slice(0, 2000)}
            {JSON.stringify(diff).length > 2000 ? '\n…' : ''}
          </pre>
        </div>
      )}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import { Icon } from '../ui/Icon';
import type { VoiceAssistantData } from '../../../lib/api';
import type { VoiceAssistantUpdatePayload } from '../../../lib/api';
import {
  isAutonomousBlocked,
  needsDangerousAutonomousConfirm,
  requiresHumanConfirmation,
  riskTone,
  VOICE_PERMISSION_MODE_OPTIONS,
  VOICE_TOOL_CAPABILITY_ROWS,
  type VoicePermissionMode,
  type VoiceToolCapabilityKey,
  type VoiceToolPermissionsMap,
} from './voice-assistant-permissions.ops';

interface VoicePermissionsMatrixProps {
  assistant: VoiceAssistantData;
  draft: VoiceAssistantUpdatePayload;
  saving: boolean;
  hasDraft: boolean;
  onModeChange: (key: VoiceToolCapabilityKey, mode: VoicePermissionMode) => void;
  onSave: () => void;
}

export function VoicePermissionsMatrix({
  assistant,
  draft,
  saving,
  hasDraft,
  onModeChange,
  onSave,
}: VoicePermissionsMatrixProps) {
  const [pendingConfirm, setPendingConfirm] = useState<{
    key: VoiceToolCapabilityKey;
    mode: VoicePermissionMode;
  } | null>(null);

  const effectivePermissions = useMemo((): VoiceToolPermissionsMap => {
    const base = assistant.toolPermissions;
    if (!base) {
      return {} as VoiceToolPermissionsMap;
    }
    return draft.toolPermissions ? { ...base, ...draft.toolPermissions } : base;
  }, [assistant.toolPermissions, draft.toolPermissions]);

  const handleModeSelect = (key: VoiceToolCapabilityKey, mode: VoicePermissionMode) => {
    const row = VOICE_TOOL_CAPABILITY_ROWS.find(r => r.key === key);
    if (!row) return;

    if (mode === 'AUTONOMOUS' && isAutonomousBlocked(row, assistant.outboundEnabled)) {
      return;
    }

    if (needsDangerousAutonomousConfirm(row, mode)) {
      setPendingConfirm({ key, mode });
      return;
    }

    onModeChange(key, mode);
    setPendingConfirm(null);
  };

  return (
    <div className="space-y-4">
      <div className="surface-premium rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)] sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold tracking-[-0.02em] text-foreground">Tool & rights matrix</h3>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-muted-foreground">
              Control what the voice assistant may do during calls. <strong className="font-semibold">Suggest only</strong> means
              the assistant proposes an action — a human must confirm. <strong className="font-semibold">Autonomous</strong> allows
              execution without confirmation.
            </p>
          </div>
          {hasDraft && (
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="sq-press inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-[color:var(--brand)]/35 bg-[color:var(--brand-soft)] px-3.5 py-1.5 text-[11px] font-semibold text-[color:var(--brand-ink)] disabled:opacity-60"
            >
              <Icon name={saving ? 'loader-2' : 'save'} className={cn('h-3.5 w-3.5', saving && 'animate-spin')} />
              Save permissions
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <StatusChip tone="success" className="text-[9px]">Low risk</StatusChip>
          <StatusChip tone="info" className="text-[9px]">Medium</StatusChip>
          <StatusChip tone="watch" className="text-[9px]">High</StatusChip>
          <StatusChip tone="critical" className="text-[9px]">Critical</StatusChip>
        </div>
      </div>

      {pendingConfirm && (
        <div className="surface-premium rounded-xl border border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/[0.04] p-4">
          <div className="flex items-start gap-2">
            <Icon name="alert-triangle" className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--status-critical)]" />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold text-foreground">Enable autonomous mode?</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                This capability is classified as high risk. Autonomous execution can change operational data or
                initiate outbound actions without staff review. The backend will still enforce guardrails.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onModeChange(pendingConfirm.key, pendingConfirm.mode);
                    setPendingConfirm(null);
                  }}
                  className="sq-press rounded-lg border border-[color:var(--status-critical)]/40 bg-[color:var(--status-critical)]/10 px-3 py-1.5 text-[10px] font-semibold text-[color:var(--status-critical)]"
                >
                  Confirm autonomous
                </button>
                <button
                  type="button"
                  onClick={() => setPendingConfirm(null)}
                  className="sq-press rounded-lg border border-border/60 surface-premium px-3 py-1.5 text-[10px] font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="surface-premium overflow-hidden rounded-2xl border border-border/40 shadow-[var(--shadow-1)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border/60 bg-muted/20">
                {['Capability', 'What it allows', 'Risk', 'Mode', 'Human confirm?', 'Notes'].map(h => (
                  <th
                    key={h}
                    className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {VOICE_TOOL_CAPABILITY_ROWS.map(row => {
                const mode = effectivePermissions[row.key] ?? 'DISABLED';
                const autonomousBlocked = isAutonomousBlocked(row, assistant.outboundEnabled);

                return (
                  <tr
                    key={row.key}
                    className="border-b border-border/40 transition-colors last:border-0 hover:bg-muted/10"
                  >
                    <td className="px-3 py-3 align-top">
                      <p className="text-[11px] font-semibold text-foreground">{row.label}</p>
                    </td>
                    <td className="max-w-[200px] px-3 py-3 align-top">
                      <p className="text-[10px] leading-relaxed text-muted-foreground">{row.description}</p>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <StatusChip tone={riskTone(row.riskLevel)} className="text-[9px] capitalize">
                        {row.riskLevel}
                      </StatusChip>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <select
                        value={mode}
                        onChange={e => handleModeSelect(row.key, e.target.value as VoicePermissionMode)}
                        className="w-full min-w-[120px] rounded-lg border border-border/60 bg-background px-2 py-1.5 text-[10px] font-semibold text-foreground outline-none focus:border-[color:var(--brand)]/40"
                      >
                        {VOICE_PERMISSION_MODE_OPTIONS.map(opt => (
                          <option
                            key={opt.value}
                            value={opt.value}
                            disabled={opt.value === 'AUTONOMOUS' && autonomousBlocked}
                          >
                            {opt.label}
                            {opt.value === 'AUTONOMOUS' && autonomousBlocked ? ' (blocked)' : ''}
                          </option>
                        ))}
                      </select>
                      {autonomousBlocked && mode !== 'AUTONOMOUS' && (
                        <p className="mt-1 text-[9px] text-muted-foreground">
                          {row.requiresOutboundForAutonomous && !assistant.outboundEnabled
                            ? 'Requires outbound telephony'
                            : 'Autonomous not allowed'}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span className="text-[10px] font-medium text-foreground">
                        {mode === 'DISABLED' ? '—' : requiresHumanConfirmation(mode) ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="max-w-[160px] px-3 py-3 align-top">
                      <p className="text-[9px] leading-relaxed text-muted-foreground">{row.notes ?? '—'}</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {!assistant.outboundEnabled && (
        <p className="flex items-start gap-2 text-[10px] text-muted-foreground">
          <Icon name="phone-off" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Outbound telephony is disabled. Customer and vendor contact cannot be set to autonomous until enabled in Telephony.
        </p>
      )}
    </div>
  );
}

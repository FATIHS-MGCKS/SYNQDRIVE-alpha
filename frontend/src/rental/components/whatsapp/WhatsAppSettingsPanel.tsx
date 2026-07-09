import { Icon } from '../ui/Icon';
import { StatusChip } from '../../../components/patterns';
import type { WhatsAppConfig } from '../../../lib/api';
import { AI_MODE_META, isSandboxEnvironment } from './whatsapp.ops';

interface WhatsAppSettingsPanelProps {
  config: WhatsAppConfig | null;
  saving: boolean;
  onSave: (patch: Partial<WhatsAppConfig>) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onSimulate: () => void;
}

export function WhatsAppSettingsPanel({
  config,
  saving,
  onSave,
  onConnect,
  onDisconnect,
  onSimulate,
}: WhatsAppSettingsPanelProps) {
  const sandboxVisible = isSandboxEnvironment();
  const aiMode = config?.aiMode ?? 'OFF';

  const toggle = (key: keyof WhatsAppConfig, value: boolean) => {
    onSave({ [key]: value } as Partial<WhatsAppConfig>);
  };

  return (
    <div className="space-y-4">
      {/* Connection */}
      <section className="surface-premium rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)]">
        <h3 className="text-[12px] font-semibold text-foreground">Connection</h3>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Manual Meta Cloud API configuration — embedded signup pending.
        </p>
        <dl className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Business name</dt>
            <dd className="font-medium text-foreground">{config?.businessName ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Phone number</dt>
            <dd className="font-medium text-foreground">{config?.phoneNumber ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Phone number ID</dt>
            <dd className="font-mono text-foreground">
              {config?.phoneNumberId ? `••••${config.phoneNumberId.slice(-4)}` : 'Not set'}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Provider</dt>
            <dd>
              <StatusChip
                tone={config?.providerConfigured ? 'success' : 'watch'}
              >
                {config?.providerStatus ?? 'NOT_CONFIGURED'}
              </StatusChip>
            </dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onConnect}
            className="sq-press rounded-xl bg-[color:var(--brand)] px-3 py-2 text-[11px] font-semibold text-white"
          >
            {config?.isConnected ? 'Reconnect / configure' : 'Connect'}
          </button>
          {config?.isConnected && (
            <button
              type="button"
              onClick={onDisconnect}
              className="sq-press rounded-xl border border-[color:var(--status-critical)]/30 px-3 py-2 text-[11px] font-semibold text-[color:var(--status-critical)]"
            >
              Disconnect
            </button>
          )}
        </div>
      </section>

      {/* AI */}
      <section className="surface-premium rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)]">
        <h3 className="text-[12px] font-semibold text-foreground">AI assistance</h3>
        <p className="mt-1 text-[10px] text-muted-foreground">
          SynqDrive AI uses Vehicle Intelligence / DIMO Agent as an internal tool for context — humans control what is sent.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(Object.keys(AI_MODE_META) as WhatsAppConfig['aiMode'][]).map(key => {
            const meta = AI_MODE_META[key];
            const active = aiMode === key;
            return (
              <button
                key={key}
                type="button"
                disabled={saving}
                onClick={() => onSave({ aiMode: key })}
                className={`sq-press rounded-xl border p-3 text-left transition-all ${
                  active
                    ? 'border-[color:var(--brand)]/40 bg-[color:var(--brand)]/[0.05]'
                    : 'border-border/40 hover:bg-muted/30'
                }`}
              >
                <p className="text-[11px] font-semibold text-foreground">{meta.label}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{meta.description}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Human handover */}
      <section className="surface-premium rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)]">
        <h3 className="text-[12px] font-semibold text-foreground">Human handover</h3>
        <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-muted/20 px-3 py-2.5">
          <span className="text-[11px] text-foreground">Escalation enabled for sensitive topics</span>
          <button
            type="button"
            role="switch"
            aria-checked={config?.aiEscalationEnabled ?? false}
            onClick={() => toggle('aiEscalationEnabled', !config?.aiEscalationEnabled)}
            className={`relative h-5 w-9 rounded-full transition-colors ${
              config?.aiEscalationEnabled ? 'bg-[color:var(--status-positive)]' : 'bg-muted'
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                config?.aiEscalationEnabled ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </label>
      </section>

      {/* Compliance */}
      <section className="surface-premium rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)]">
        <h3 className="text-[12px] font-semibold text-foreground">Compliance</h3>
        <ul className="mt-2 space-y-1.5 text-[10px] text-muted-foreground">
          <li className="flex gap-2">
            <Icon name="shield" className="h-3.5 w-3.5 shrink-0" />
            STOP / STOPP / Abmelden processed server-side as opt-out
          </li>
          <li className="flex gap-2">
            <Icon name="lock" className="h-3.5 w-3.5 shrink-0" />
            Access tokens stored server-side only — never in this UI
          </li>
          <li className="flex gap-2">
            <Icon name="archive" className="h-3.5 w-3.5 shrink-0" />
            Message retention follows org policy and Meta requirements
          </li>
        </ul>
      </section>

      {/* Sandbox */}
      {sandboxVisible && (
        <section className="surface-premium rounded-2xl border border-dashed border-[color:var(--status-watch)]/40 bg-[color:var(--status-watch)]/[0.03] p-4">
          <div className="flex items-center gap-2">
            <StatusChip tone="watch">
              Sandbox
            </StatusChip>
            <h3 className="text-[12px] font-semibold text-foreground">Dev / test only</h3>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Simulate inbound messages without Meta webhooks. Not available in production.
          </p>
          <button
            type="button"
            onClick={onSimulate}
            className="sq-press mt-3 rounded-xl border border-border/60 px-3 py-2 text-[11px] font-semibold text-foreground hover:bg-muted"
          >
            Simulate incoming message
          </button>
        </section>
      )}
    </div>
  );
}

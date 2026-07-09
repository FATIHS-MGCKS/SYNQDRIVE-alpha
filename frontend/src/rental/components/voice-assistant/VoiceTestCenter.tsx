import { useEffect, useMemo, useState } from 'react';
import { StatusChip } from '../../../components/patterns';
import { EmptyState } from '../../../components/patterns/states';
import { cn } from '../../../components/ui/utils';
import { api, getErrorMessage } from '../../../lib/api';
import type {
  VoiceAssistantData,
  VoiceAssistantReadiness,
  VoiceAssistantTestSession,
} from '../../../lib/api';
import { Icon } from '../ui/Icon';
import type { VoiceTab } from './voice-assistant.ops';
import { VOICE_TEST_SCENARIOS, type VoiceTestScenario } from './voice-test-scenarios';

type SessionPhase = 'idle' | 'starting' | 'active' | 'expired' | 'error' | 'blocked';
type TestVerdict = 'passed' | 'needs_review' | 'failed';

interface VoiceTestCenterProps {
  orgId: string;
  assistant: VoiceAssistantData;
  readiness: VoiceAssistantReadiness | null;
  onTestPassed: () => void;
  onNavigateTab: (tab: VoiceTab) => void;
}

export function VoiceTestCenter({
  orgId,
  assistant,
  readiness,
  onTestPassed,
  onNavigateTab,
}: VoiceTestCenterProps) {
  const [session, setSession] = useState<VoiceAssistantTestSession | null>(null);
  const [phase, setPhase] = useState<SessionPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<VoiceTestScenario | null>(null);
  const [showDevDetails, setShowDevDetails] = useState(false);
  const [verdict, setVerdict] = useState<TestVerdict | null>(null);
  const [notes, setNotes] = useState('');

  const micSupported = useMemo(
    () => typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia),
    [],
  );

  const readinessPct = useMemo(() => {
    if (!readiness?.checks.length) return 0;
    const required = readiness.checks.filter(c => c.required !== false);
    const pool = required.length > 0 ? required : readiness.checks;
    return Math.round((pool.filter(c => c.ok).length / pool.length) * 100);
  }, [readiness]);

  useEffect(() => {
    if (phase !== 'active' || !session?.expiresAt) return;
    const expiresAt = session.expiresAt;
    const id = window.setInterval(() => {
      if (new Date(expiresAt).getTime() <= Date.now()) {
        setPhase('expired');
      }
    }, 10_000);
    return () => window.clearInterval(id);
  }, [session?.expiresAt, phase]);

  const resetSession = () => {
    setSession(null);
    setPhase('idle');
    setError(null);
    setShowDevDetails(false);
  };

  const startSession = async () => {
    if (!orgId) return;
    if (!micSupported) {
      setError('Microphone access is not supported in this browser. Try Chrome or Edge on desktop.');
      setPhase('error');
      return;
    }

    setPhase('starting');
    setError(null);
    setVerdict(null);

    try {
      const res = await api.voiceAssistant.testSession(orgId);
      setSession(res);

      if (res.status === 'blocked') {
        setPhase('blocked');
        return;
      }

      setPhase('active');
      onTestPassed();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not start test session'));
      setPhase('error');
    }
  };

  const agentProvisioned = Boolean(assistant.elevenLabsAgentId);
  const providerOk = readiness?.checks.find(c => c.key === 'elevenlabs')?.ok ?? false;

  const statusLabel =
    phase === 'active'
      ? 'Session active'
      : phase === 'starting'
        ? 'Starting…'
        : phase === 'expired'
          ? 'Session expired'
          : phase === 'blocked'
            ? 'Blocked — fix configuration'
            : phase === 'error'
              ? 'Error'
              : 'Ready to test';

  const statusTone =
    phase === 'active'
      ? 'success'
      : phase === 'error' || phase === 'expired'
        ? 'critical'
        : phase === 'blocked'
          ? 'watch'
          : 'neutral';

  return (
    <div className="space-y-4">
      {/* Readiness + status header */}
      <div className="surface-premium rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)] sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-sm font-bold tracking-[-0.02em] text-foreground">Test Center</h3>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Validate greeting, tone, escalation, and permissions before going live on phone.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone={statusTone} className="text-[10px]">
              {statusLabel}
            </StatusChip>
            <StatusChip tone={readiness?.ready ? 'success' : 'watch'} className="text-[10px]">
              Readiness {readinessPct}%
            </StatusChip>
          </div>
        </div>

        {readiness && !readiness.ready && (
          <div className="mt-3 rounded-lg border border-[color:var(--status-watch)]/25 bg-[color:var(--status-watch)]/[0.04] px-3 py-2">
            <p className="text-[10px] font-semibold text-foreground">Readiness gaps</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {(readiness.missing ?? []).join(' · ') || 'Some checks are incomplete.'}
            </p>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[
            {
              label: 'Provider',
              ok: providerOk,
              value: providerOk ? 'ElevenLabs connected' : 'Not connected',
            },
            {
              label: 'Agent',
              ok: agentProvisioned,
              value: agentProvisioned
                ? `${assistant.elevenLabsAgentId?.slice(0, 10)}…`
                : 'Not provisioned',
            },
            {
              label: 'Voice',
              ok: Boolean(assistant.voiceId),
              value: assistant.voiceName ?? 'Not set',
            },
          ].map(row => (
            <div
              key={row.label}
              className={cn(
                'rounded-lg border px-3 py-2',
                row.ok
                  ? 'border-[color:var(--status-positive)]/20 bg-[color:var(--status-positive)]/[0.03]'
                  : 'border-border/50 bg-muted/15',
              )}
            >
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                {row.label}
              </p>
              <p className="mt-0.5 truncate text-[11px] font-semibold text-foreground">{row.value}</p>
            </div>
          ))}
        </div>

        {session?.warnings && session.warnings.length > 0 && (
          <ul className="mt-3 space-y-1">
            {session.warnings.map(w => (
              <li key={w} className="flex items-start gap-1.5 text-[10px] text-[color:var(--status-watch)]">
                <Icon name="alert-triangle" className="mt-0.5 h-3 w-3 shrink-0" />
                {w}
              </li>
            ))}
          </ul>
        )}

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/[0.04] px-3 py-2">
            <Icon name="alert-circle" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--status-critical)]" />
            <p className="text-[10px] text-muted-foreground">{error}</p>
          </div>
        )}

        {!micSupported && (
          <p className="mt-3 text-[10px] text-[color:var(--status-watch)]">
            Microphone not supported in this browser — live voice testing may be unavailable.
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void startSession()}
            disabled={phase === 'starting' || !agentProvisioned || !providerOk}
            className="sq-press inline-flex min-h-9 items-center gap-2 rounded-xl border border-[color:var(--brand)]/35 bg-[color:var(--brand-soft)] px-4 py-2 text-[11px] font-semibold text-[color:var(--brand-ink)] disabled:opacity-60"
          >
            <Icon
              name={phase === 'starting' ? 'loader-2' : 'mic'}
              className={cn('h-3.5 w-3.5', phase === 'starting' && 'animate-spin')}
            />
            {phase === 'starting' ? 'Starting session…' : 'Start test session'}
          </button>
          {(phase === 'active' || phase === 'expired' || phase === 'error' || phase === 'blocked') && (
            <button
              type="button"
              onClick={resetSession}
              className="sq-press inline-flex min-h-9 items-center gap-2 rounded-xl border border-border/60 surface-premium px-4 py-2 text-[11px] font-semibold"
            >
              <Icon name="rotate-ccw" className="h-3.5 w-3.5" />
              Stop / reset
            </button>
          )}
        </div>

        {phase === 'active' && session && (
          <p className="mt-3 text-[10px] text-muted-foreground">
            {session.instructions}
            {session.expiresAt && (
              <>
                {' '}
                Expires {new Date(session.expiresAt).toLocaleTimeString()}.
              </>
            )}
          </p>
        )}

        {phase === 'expired' && (
          <p className="mt-3 text-[10px] text-[color:var(--status-critical)]">
            Test session expired. Start a new session to continue testing.
          </p>
        )}

        {!agentProvisioned && (
          <EmptyState
            compact
            className="mt-4"
            icon={<Icon name="bot" className="h-5 w-5" />}
            title="Agent not provisioned"
            description="Activate the assistant from the command center to create an ElevenLabs agent before testing."
            action={
              <button
                type="button"
                onClick={() => onNavigateTab('overview')}
                className="sq-press rounded-lg border border-border/60 surface-premium px-4 py-2 text-xs font-semibold"
              >
                Open launch checklist
              </button>
            }
          />
        )}
      </div>

      {/* Scenarios */}
      <section className="surface-premium rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)]">
        <h4 className="text-[12px] font-bold text-foreground">Test scenarios</h4>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Select a scenario to define expected behavior. No automated simulation — use it as an operator script.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {VOICE_TEST_SCENARIOS.map(scenario => (
            <button
              key={scenario.id}
              type="button"
              onClick={() => setSelectedScenario(scenario)}
              className={cn(
                'sq-press rounded-xl border p-3 text-left transition-all',
                selectedScenario?.id === scenario.id
                  ? 'border-[color:var(--brand)]/35 bg-[color:var(--brand-soft)]/40 ring-1 ring-[color:var(--brand)]/15'
                  : 'border-border/50 bg-muted/10 hover:bg-muted/20',
              )}
            >
              <p className="text-[11px] font-semibold text-foreground">{scenario.title}</p>
              <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{scenario.prompt}</p>
            </button>
          ))}
        </div>

        {selectedScenario && (
          <div className="mt-4 rounded-xl border border-border/50 bg-muted/10 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Current test scenario
            </p>
            <p className="mt-1 text-[12px] font-semibold text-foreground">{selectedScenario.title}</p>
            <p className="mt-2 text-[11px] italic text-muted-foreground">
              &ldquo;{selectedScenario.prompt}&rdquo;
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-[10px] font-semibold text-foreground">Expected behavior</p>
                <ul className="mt-1 list-inside list-disc text-[10px] text-muted-foreground">
                  {selectedScenario.expectedBehavior.map(line => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-foreground">Escalate when</p>
                <ul className="mt-1 list-inside list-disc text-[10px] text-muted-foreground">
                  {selectedScenario.escalateWhen.map(line => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              Permissions involved: {selectedScenario.permissions.join(' · ')}
            </p>
            {selectedScenario.fixTab && (
              <button
                type="button"
                onClick={() => onNavigateTab(selectedScenario.fixTab!)}
                className="mt-3 text-[10px] font-semibold text-[color:var(--brand-ink)]"
              >
                Review in {selectedScenario.fixTab} →
              </button>
            )}
          </div>
        )}
      </section>

      {/* Live transcript placeholder */}
      <section className="surface-premium rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)]">
        <h4 className="text-[12px] font-bold text-foreground">Live session</h4>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Real-time transcript and tool-policy decisions will appear here when live integration is enabled.
        </p>
        {phase === 'active' ? (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {[
              { label: 'Live transcript', hint: 'Waiting for live stream…' },
              { label: 'Assistant response', hint: 'No response yet' },
              { label: 'Detected intent', hint: '—' },
              { label: 'Tool policy decision', hint: '—' },
              { label: 'Escalation triggered', hint: 'No' },
              { label: 'Latency', hint: '—' },
            ].map(panel => (
              <div
                key={panel.label}
                className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-3 py-2.5"
              >
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                  {panel.label}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">{panel.hint}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            compact
            className="mt-3"
            icon={<Icon name="message-square" className="h-5 w-5" />}
            title="No active session"
            description="Start a test session to see transcript and policy panels."
          />
        )}
      </section>

      {/* Test result (local UI only) */}
      <section className="surface-premium rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)]">
        <h4 className="text-[12px] font-bold text-foreground">Test result</h4>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Record your operator verdict locally. Results are not saved to the server yet.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              { id: 'passed' as const, label: 'Passed', tone: 'success' },
              { id: 'needs_review' as const, label: 'Needs review', tone: 'watch' },
              { id: 'failed' as const, label: 'Failed', tone: 'critical' },
            ] as const
          ).map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setVerdict(opt.id)}
              className={cn(
                'sq-press rounded-lg border px-3 py-1.5 text-[10px] font-semibold',
                verdict === opt.id
                  ? 'border-[color:var(--brand)]/40 bg-[color:var(--brand-soft)]'
                  : 'border-border/60 surface-premium',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <textarea
          className="mt-3 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-[11px] outline-none focus:border-[color:var(--brand)]/40"
          rows={3}
          placeholder="Notes: what worked, what failed, escalation issues…"
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
        {verdict && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onNavigateTab('config')}
              className="text-[10px] font-semibold text-muted-foreground hover:text-foreground"
            >
              → Configuration
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('permissions')}
              className="text-[10px] font-semibold text-muted-foreground hover:text-foreground"
            >
              → Permissions
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('escalation')}
              className="text-[10px] font-semibold text-muted-foreground hover:text-foreground"
            >
              → Escalation
            </button>
          </div>
        )}
      </section>

      {/* Developer details */}
      {session?.developerDetails?.signedUrl && (
        <details
          className="surface-premium rounded-2xl border border-border/40 shadow-[var(--shadow-1)]"
          open={showDevDetails}
          onToggle={e => setShowDevDetails((e.target as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer px-4 py-3 text-[11px] font-semibold text-muted-foreground">
            Developer details (signed WebSocket URL)
          </summary>
          <div className="border-t border-border/40 px-4 py-3">
            <code className="block break-all rounded-lg bg-muted/30 p-2 font-mono text-[9px] text-muted-foreground">
              {session.developerDetails.signedUrl}
            </code>
            <p className="mt-2 text-[9px] text-muted-foreground">
              For engineering use with the ElevenLabs SDK. Operators should use Start test session above.
            </p>
          </div>
        </details>
      )}
    </div>
  );
}

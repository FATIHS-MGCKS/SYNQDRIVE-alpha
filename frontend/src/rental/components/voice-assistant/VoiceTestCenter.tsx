import { useEffect, useMemo, useState } from 'react';
import { StatusChip } from '../../../components/patterns';
import { EmptyState } from '../../../components/patterns/states';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../../i18n/LanguageContext';
import { api, getErrorMessage } from '../../../lib/api';
import type {
  VoiceAssistantData,
  VoiceAssistantReadiness,
  VoiceAssistantTestSession,
} from '../../../lib/api';
import { Icon } from '../ui/Icon';
import type { VoiceTab } from './voice-assistant.ops';
import {
  labelTestSessionPhase,
  labelTestVerdict,
  labelVoiceTab,
  localizedVoiceTestScenarios,
  type TestSessionPhase,
  type TestVerdictId,
} from './voice-assistant-i18n';
import {
  VOICE_TEST_SCENARIO_DEFINITIONS,
} from './voice-test-scenarios';

type TestVerdict = TestVerdictId | null;

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
  const { locale, t } = useLanguage();
  const scenarios = useMemo(
    () => localizedVoiceTestScenarios(locale, VOICE_TEST_SCENARIO_DEFINITIONS),
    [locale],
  );

  const [session, setSession] = useState<VoiceAssistantTestSession | null>(null);
  const [phase, setPhase] = useState<TestSessionPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const selectedScenario = useMemo(
    () => scenarios.find(scenario => scenario.id === selectedScenarioId) ?? null,
    [scenarios, selectedScenarioId],
  );
  const [verdict, setVerdict] = useState<TestVerdict>(null);
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
  };

  const startSession = async () => {
    if (!orgId) return;
    if (!micSupported) {
      setError(t('voice.test.micUnsupportedStart'));
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
      setError(getErrorMessage(err, t('voice.test.startSessionError')));
      setPhase('error');
    }
  };

  const agentProvisioned = Boolean(assistant.elevenLabsAgentId);
  const providerOk = readiness?.checks.find(c => c.key === 'elevenlabs')?.ok ?? false;

  const statusLabel = labelTestSessionPhase(locale, phase);
  const statusTone =
    phase === 'active'
      ? 'success'
      : phase === 'error' || phase === 'expired'
        ? 'critical'
        : phase === 'blocked'
          ? 'watch'
          : 'neutral';

  const livePanels = [
    { labelKey: 'voice.test.live.transcript' as const, hintKey: 'voice.test.live.waitingStream' as const },
    { labelKey: 'voice.test.live.assistantResponse' as const, hintKey: 'voice.test.live.noResponse' as const },
    { labelKey: 'voice.test.live.detectedIntent' as const, hintKey: 'voice.test.live.dash' as const },
    { labelKey: 'voice.test.live.toolPolicy' as const, hintKey: 'voice.test.live.dash' as const },
    { labelKey: 'voice.test.live.escalationTriggered' as const, hintKey: 'voice.test.live.no' as const },
    { labelKey: 'voice.test.live.latency' as const, hintKey: 'voice.test.live.dash' as const },
  ];

  const verdictOptions: { id: TestVerdictId; tone: 'success' | 'watch' | 'critical' }[] = [
    { id: 'passed', tone: 'success' },
    { id: 'needs_review', tone: 'watch' },
    { id: 'failed', tone: 'critical' },
  ];

  const navTabs: VoiceTab[] = ['config', 'permissions', 'escalation'];

  return (
    <div className="space-y-4">
      <div className="surface-premium rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)] sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-sm font-bold tracking-[-0.02em] text-foreground">
              {t('voice.nav.tab.test')}
            </h3>
            <p className="mt-1 text-[11px] text-muted-foreground">{t('voice.test.subtitle')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone={statusTone} className="text-[10px]">
              {statusLabel}
            </StatusChip>
            <StatusChip tone={readiness?.ready ? 'success' : 'watch'} className="text-[10px]">
              {t('voice.test.readinessChip', { pct: readinessPct })}
            </StatusChip>
          </div>
        </div>

        {readiness && !readiness.ready && (
          <div className="mt-3 rounded-lg border border-[color:var(--status-watch)]/25 bg-[color:var(--status-watch)]/[0.04] px-3 py-2">
            <p className="text-[10px] font-semibold text-foreground">{t('voice.test.readinessGaps')}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {(readiness.missing ?? []).join(' · ') || t('voice.test.readinessIncomplete')}
            </p>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[
            {
              label: t('voice.test.row.provider'),
              ok: providerOk,
              value: providerOk
                ? t('voice.test.row.providerConnected')
                : t('voice.test.row.notConnected'),
            },
            {
              label: t('voice.test.row.agent'),
              ok: agentProvisioned,
              value: agentProvisioned
                ? `${assistant.elevenLabsAgentId?.slice(0, 10)}…`
                : t('voice.test.row.notProvisioned'),
            },
            {
              label: t('voice.test.row.voice'),
              ok: Boolean(assistant.voiceId),
              value: assistant.voiceName ?? t('voice.test.row.notSet'),
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
            {t('voice.test.micUnsupported')}
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
            {phase === 'starting' ? t('voice.test.startingSession') : t('voice.test.startSession')}
          </button>
          {(phase === 'active' || phase === 'expired' || phase === 'error' || phase === 'blocked') && (
            <button
              type="button"
              onClick={resetSession}
              className="sq-press inline-flex min-h-9 items-center gap-2 rounded-xl border border-border/60 surface-premium px-4 py-2 text-[11px] font-semibold"
            >
              <Icon name="rotate-ccw" className="h-3.5 w-3.5" />
              {t('voice.test.stopReset')}
            </button>
          )}
        </div>

        {phase === 'active' && session && (
          <p className="mt-3 text-[10px] text-muted-foreground">
            {session.instructions}
            {session.expiresAt && (
              <>
                {' '}
                {t('voice.test.expiresAt', {
                  time: new Date(session.expiresAt).toLocaleTimeString(),
                })}
              </>
            )}
          </p>
        )}

        {phase === 'expired' && (
          <p className="mt-3 text-[10px] text-[color:var(--status-critical)]">
            {t('voice.test.sessionExpired')}
          </p>
        )}

        {!agentProvisioned && (
          <EmptyState
            compact
            className="mt-4"
            icon={<Icon name="bot" className="h-5 w-5" />}
            title={t('voice.test.agentNotProvisioned.title')}
            description={t('voice.test.agentNotProvisioned.description')}
            action={
              <button
                type="button"
                onClick={() => onNavigateTab('overview')}
                className="sq-press rounded-lg border border-border/60 surface-premium px-4 py-2 text-xs font-semibold"
              >
                {t('voice.test.openLaunchChecklist')}
              </button>
            }
          />
        )}
      </div>

      <section className="surface-premium rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)]">
        <h4 className="text-[12px] font-bold text-foreground">{t('voice.test.scenarios.title')}</h4>
        <p className="mt-1 text-[10px] text-muted-foreground">{t('voice.test.scenarios.subtitle')}</p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {scenarios.map(scenario => (
            <button
              key={scenario.id}
              type="button"
              onClick={() => setSelectedScenarioId(scenario.id)}
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
              {t('voice.test.scenarios.current')}
            </p>
            <p className="mt-1 text-[12px] font-semibold text-foreground">{selectedScenario.title}</p>
            <p className="mt-2 text-[11px] italic text-muted-foreground">
              &ldquo;{selectedScenario.prompt}&rdquo;
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-[10px] font-semibold text-foreground">
                  {t('voice.test.scenarios.expectedBehavior')}
                </p>
                <ul className="mt-1 list-inside list-disc text-[10px] text-muted-foreground">
                  {selectedScenario.expectedBehavior.map(line => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-foreground">
                  {t('voice.test.scenarios.escalateWhen')}
                </p>
                <ul className="mt-1 list-inside list-disc text-[10px] text-muted-foreground">
                  {selectedScenario.escalateWhen.map(line => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              {t('voice.test.scenarios.permissionsInvolved', {
                permissions: selectedScenario.permissions.join(' · '),
              })}
            </p>
            {selectedScenario.fixTab && (
              <button
                type="button"
                onClick={() => onNavigateTab(selectedScenario.fixTab!)}
                className="mt-3 text-[10px] font-semibold text-[color:var(--brand-ink)]"
              >
                {t('voice.test.scenarios.reviewIn', {
                  tab: labelVoiceTab(locale, selectedScenario.fixTab),
                })}
              </button>
            )}
          </div>
        )}
      </section>

      <section className="surface-premium rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)]">
        <h4 className="text-[12px] font-bold text-foreground">{t('voice.test.live.title')}</h4>
        <p className="mt-1 text-[10px] text-muted-foreground">{t('voice.test.live.subtitle')}</p>
        {phase === 'active' ? (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {livePanels.map(panel => (
              <div
                key={panel.labelKey}
                className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-3 py-2.5"
              >
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                  {t(panel.labelKey)}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">{t(panel.hintKey)}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            compact
            className="mt-3"
            icon={<Icon name="message-square" className="h-5 w-5" />}
            title={t('voice.test.live.noActiveSession.title')}
            description={t('voice.test.live.noActiveSession.description')}
          />
        )}
      </section>

      <section className="surface-premium rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)]">
        <h4 className="text-[12px] font-bold text-foreground">{t('voice.test.result.title')}</h4>
        <p className="mt-1 text-[10px] text-muted-foreground">{t('voice.test.result.subtitle')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {verdictOptions.map(opt => (
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
              {labelTestVerdict(locale, opt.id)}
            </button>
          ))}
        </div>
        <textarea
          className="mt-3 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-[11px] outline-none focus:border-[color:var(--brand)]/40"
          rows={3}
          placeholder={t('voice.test.notesPlaceholder')}
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
        {verdict && (
          <div className="mt-3 flex flex-wrap gap-2">
            {navTabs.map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => onNavigateTab(tab)}
                className="text-[10px] font-semibold text-muted-foreground hover:text-foreground"
              >
                {t('voice.test.navTo', { tab: labelVoiceTab(locale, tab) })}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

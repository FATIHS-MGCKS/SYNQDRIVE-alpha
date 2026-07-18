import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../../../components/ui/accordion';
import { StatusChip } from '../../../components/patterns';
import { EmptyState } from '../../../components/patterns/states';
import { VoiceInlineNotice, VoiceSectionHeader } from '../../../components/voice-ui';
import { cn } from '../../../components/ui/utils';
import { api, getErrorMessage } from '../../../lib/api';
import type {
  VoiceAssistantData,
  VoiceAssistantReadiness,
  VoiceTestCenterSummary,
  VoiceTestRunView,
  VoiceTestVerdict,
} from '../../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { Icon } from '../ui/Icon';
import type { VoiceTab } from './voice-assistant.ops';
import {
  VOICE_TEST_SCENARIOS,
  verdictTone,
  type VoiceTestScenario,
  type VoiceTestScenarioId,
} from './voice-test-scenarios';

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
  const { t } = useLanguage();
  const [summary, setSummary] = useState<VoiceTestCenterSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<VoiceTestScenario | null>(null);
  const [activeRun, setActiveRun] = useState<VoiceTestRunView | null>(null);
  const [running, setRunning] = useState(false);
  const [verdictNotes, setVerdictNotes] = useState('');
  const [recordingVerdict, setRecordingVerdict] = useState(false);
  const [mode, setMode] = useState<'simulation' | 'live'>('simulation');

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.voiceAssistant.testRuns.summary(orgId);
      setSummary(res);
      if (res.ready) onTestPassed();
    } catch (err) {
      setError(getErrorMessage(err, t('voice.test.loadError')));
    } finally {
      setLoading(false);
    }
  }, [orgId, onTestPassed, t]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const readinessPct = useMemo(() => {
    if (!readiness?.checks.length) return 0;
    const required = readiness.checks.filter(c => c.required !== false);
    const pool = required.length > 0 ? required : readiness.checks;
    return Math.round((pool.filter(c => c.ok).length / pool.length) * 100);
  }, [readiness]);

  const latestForScenario = useCallback(
    (scenarioId: VoiceTestScenarioId) =>
      summary?.scenarios.find(row => row.scenarioId === scenarioId)?.latest ?? null,
    [summary],
  );

  const runScenario = async () => {
    if (!selectedScenario) return;
    setRunning(true);
    setError(null);
    try {
      const run = await api.voiceAssistant.testRuns.run(orgId, {
        scenarioId: selectedScenario.id,
        mode,
      });
      setActiveRun(run);
      setVerdictNotes(run.reason ?? '');
    } catch (err) {
      setError(getErrorMessage(err, t('voice.test.runError')));
    } finally {
      setRunning(false);
    }
  };

  const submitVerdict = async (verdict: VoiceTestVerdict) => {
    if (!activeRun) return;
    setRecordingVerdict(true);
    setError(null);
    try {
      const reason =
        verdictNotes.trim() ||
        (verdict === 'PASS'
          ? t('voice.test.verdict.passDefault')
          : verdict === 'PARTIAL'
            ? t('voice.test.verdict.partialDefault')
            : t('voice.test.verdict.failDefault'));

      await api.voiceAssistant.testRuns.recordVerdict(orgId, activeRun.id, {
        verdict,
        reason,
      });
      setActiveRun(null);
      setSelectedScenario(null);
      setVerdictNotes('');
      await loadSummary();
    } catch (err) {
      setError(getErrorMessage(err, t('voice.test.verdictError')));
    } finally {
      setRecordingVerdict(false);
    }
  };

  return (
    <div className="space-y-4">
      <VoiceSectionHeader
        title={t('voice.test.title')}
        description={t('voice.test.description')}
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusChip tone={summary?.ready ? 'success' : 'watch'} className="text-[10px]">
              {summary
                ? t('voice.test.progress', {
                    done: summary.passedCount + summary.partialCount,
                    total: summary.requiredCount,
                  })
                : t('voice.test.loading')}
            </StatusChip>
            <StatusChip tone={readiness?.ready ? 'success' : 'watch'} className="text-[10px]">
              {t('voice.test.readiness', { pct: readinessPct })}
            </StatusChip>
          </div>
        }
      />

      <VoiceInlineNotice tone="info" title={t('voice.test.simulationDefault')}>
        {t('voice.test.simulationDefaultDesc')}
      </VoiceInlineNotice>

      {error && (
        <VoiceInlineNotice tone="blocked" title={t('voice.common.actionFailed')}>
          {error}
        </VoiceInlineNotice>
      )}

      <div className="surface-premium rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold text-muted-foreground">{t('voice.test.mode')}</span>
          <button
            type="button"
            onClick={() => setMode('simulation')}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-[10px] font-semibold',
              mode === 'simulation' ? 'border-[color:var(--brand)]/35 bg-[color:var(--brand-soft)]' : 'border-border/50',
            )}
          >
            {t('voice.test.modeSimulation')}
          </button>
          <button
            type="button"
            onClick={() => setMode('live')}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-[10px] font-semibold',
              mode === 'live' ? 'border-[color:var(--brand)]/35 bg-[color:var(--brand-soft)]' : 'border-border/50',
            )}
          >
            {t('voice.test.modeLive')}
          </button>
        </div>
        {mode === 'live' && (
          <p className="mt-2 text-[10px] text-[color:var(--status-watch)]">{t('voice.test.liveWarning')}</p>
        )}
      </div>

      <section className="surface-premium rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)]">
        <h4 className="text-[12px] font-bold text-foreground">{t('voice.test.scenariosTitle')}</h4>
        {loading ? (
          <p className="mt-3 text-[10px] text-muted-foreground">{t('voice.test.loading')}</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {VOICE_TEST_SCENARIOS.map(scenario => {
              const latest = latestForScenario(scenario.id);
              return (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => {
                    setSelectedScenario(scenario);
                    setActiveRun(null);
                  }}
                  className={cn(
                    'sq-press rounded-xl border p-3 text-left transition-all',
                    selectedScenario?.id === scenario.id
                      ? 'border-[color:var(--brand)]/35 bg-[color:var(--brand-soft)]/40 ring-1 ring-[color:var(--brand)]/15'
                      : 'border-border/50 bg-muted/10 hover:bg-muted/20',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[11px] font-semibold text-foreground">
                      {t(scenario.titleKey as 'voice.test.scenario.bookingStatus.title')}
                    </p>
                    {latest?.verdict && (
                      <StatusChip tone={verdictTone(latest.verdict)} className="text-[9px]">
                        {latest.verdict}
                      </StatusChip>
                    )}
                  </div>
                  {scenario.critical && (
                    <p className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-[color:var(--status-watch)]">
                      {t('voice.test.critical')}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {selectedScenario && (
        <section className="surface-premium rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)]">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {t('voice.test.currentScenario')}
          </p>
          <p className="mt-1 text-[12px] font-semibold text-foreground">
            {t(selectedScenario.titleKey as 'voice.test.scenario.bookingStatus.title')}
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-[10px] font-semibold text-foreground">{t('voice.test.goal')}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {t(selectedScenario.goalKey as 'voice.test.scenario.bookingStatus.goal')}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-foreground">{t('voice.test.expectation')}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {t(selectedScenario.expectationKey as 'voice.test.scenario.bookingStatus.expectation')}
              </p>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            {t('voice.test.tools')}: {selectedScenario.tools.join(' · ')}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={running}
              onClick={() => void runScenario()}
              className="sq-press inline-flex min-h-9 items-center gap-2 rounded-xl border border-[color:var(--brand)]/35 bg-[color:var(--brand-soft)] px-4 py-2 text-[11px] font-semibold text-[color:var(--brand-ink)] disabled:opacity-60"
            >
              <Icon name={running ? 'loader-2' : 'play'} className={cn('h-3.5 w-3.5', running && 'animate-spin')} />
              {running ? t('voice.test.running') : t('voice.test.run')}
            </button>
            {selectedScenario.fixTab && (
              <button
                type="button"
                onClick={() => onNavigateTab(selectedScenario.fixTab!)}
                className="text-[10px] font-semibold text-[color:var(--brand-ink)]"
              >
                {t('voice.test.reviewIn', { tab: selectedScenario.fixTab })}
              </button>
            )}
          </div>
        </section>
      )}

      {activeRun && (
        <section className="surface-premium rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)]">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-[12px] font-bold text-foreground">{t('voice.test.resultTitle')}</h4>
            {activeRun.suggestedVerdict && (
              <StatusChip tone={verdictTone(activeRun.suggestedVerdict)} className="text-[9px]">
                {t('voice.test.suggested', { verdict: activeRun.suggestedVerdict })}
              </StatusChip>
            )}
          </div>

          {activeRun.technicalDetails && (
            <Accordion type="single" collapsible className="mt-3">
              <AccordionItem value="tech" className="border-border/40">
                <AccordionTrigger className="text-[10px] font-semibold">
                  {t('voice.test.technicalDetails')}
                </AccordionTrigger>
                <AccordionContent>
                  <ul className="space-y-1">
                    {activeRun.technicalDetails.assertions.map(assertion => (
                      <li key={assertion.key} className="flex items-start gap-2 text-[10px]">
                        <Icon
                          name={assertion.ok ? 'check-circle-2' : 'alert-circle'}
                          className={cn('mt-0.5 h-3 w-3 shrink-0', assertion.ok ? 'text-[color:var(--status-positive)]' : 'text-[color:var(--status-watch)]')}
                        />
                        <span className="text-muted-foreground">{assertion.detail}</span>
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}

          <textarea
            className="mt-3 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-[11px] outline-none focus:border-[color:var(--brand)]/40"
            rows={3}
            placeholder={t('voice.test.notesPlaceholder')}
            value={verdictNotes}
            onChange={e => setVerdictNotes(e.target.value)}
          />

          <div className="mt-3 flex flex-wrap gap-2">
            {(['PASS', 'PARTIAL', 'FAIL'] as const).map(verdict => (
              <button
                key={verdict}
                type="button"
                disabled={recordingVerdict}
                onClick={() => void submitVerdict(verdict)}
                className={cn(
                  'sq-press rounded-lg border px-3 py-1.5 text-[10px] font-semibold',
                  verdict === 'PASS' && 'border-[color:var(--status-positive)]/30',
                  verdict === 'PARTIAL' && 'border-[color:var(--status-watch)]/30',
                  verdict === 'FAIL' && 'border-[color:var(--status-critical)]/30',
                )}
              >
                {verdict}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void runScenario()}
              className="text-[10px] font-semibold text-muted-foreground"
            >
              {t('voice.test.repeat')}
            </button>
          </div>
        </section>
      )}

      {!loading && !selectedScenario && (
        <EmptyState
          compact
          icon={<Icon name="flask-conical" className="h-5 w-5" />}
          title={t('voice.test.emptyTitle')}
          description={t('voice.test.emptyDesc')}
        />
      )}
    </div>
  );
}

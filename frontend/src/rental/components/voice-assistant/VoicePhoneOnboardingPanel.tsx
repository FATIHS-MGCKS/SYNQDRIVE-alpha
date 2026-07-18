import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../../../components/ui/accordion';
import { StatusChip } from '../../../components/patterns';
import { VoiceInlineNotice, VoiceSectionHeader, VoiceSkeleton } from '../../../components/voice-ui';
import { cn } from '../../../components/ui/utils';
import { api } from '../../../lib/api';
import type {
  VoiceAssistantData,
  VoicePhoneNumberSearchResult,
  VoicePhoneOnboardingPath,
  VoicePhoneOnboardingView,
} from '../../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { Icon } from '../ui/Icon';
import { phoneOnboardingStatusTone } from './voice-phone-onboarding.ops';

export interface VoicePhoneOnboardingPanelProps {
  orgId: string;
  assistant: VoiceAssistantData;
  isBusy?: boolean;
  onAssistantUpdated?: (assistant: VoiceAssistantData) => void;
  onNavigateTest?: () => void;
}

const PATH_OPTIONS: VoicePhoneOnboardingPath[] = [
  'new_synqdrive_number',
  'forward_existing',
  'port_number',
  'sip_pbx',
];

function pathTitleKey(path: VoicePhoneOnboardingPath): string {
  switch (path) {
    case 'new_synqdrive_number':
      return 'voice.phone.path.newNumber.title';
    case 'forward_existing':
      return 'voice.phone.path.forward.title';
    case 'port_number':
      return 'voice.phone.path.port.title';
    case 'sip_pbx':
      return 'voice.phone.path.sip.title';
    default:
      return 'voice.phone.path.newNumber.title';
  }
}

function pathDescriptionKey(path: VoicePhoneOnboardingPath): string {
  switch (path) {
    case 'new_synqdrive_number':
      return 'voice.phone.path.newNumber.description';
    case 'forward_existing':
      return 'voice.phone.path.forward.description';
    case 'port_number':
      return 'voice.phone.path.port.description';
    case 'sip_pbx':
      return 'voice.phone.path.sip.description';
    default:
      return 'voice.phone.path.newNumber.description';
  }
}

function statusLabelKey(status: VoicePhoneOnboardingView['status']): string {
  switch (status) {
    case 'not_started':
      return 'voice.phone.status.not_started';
    case 'path_selected':
      return 'voice.phone.status.path_selected';
    case 'evidence_required':
      return 'voice.phone.status.evidence_required';
    case 'under_review':
      return 'voice.phone.status.under_review';
    case 'reserved':
      return 'voice.phone.status.reserved';
    case 'active':
      return 'voice.phone.status.active';
    case 'failed':
      return 'voice.phone.status.failed';
    case 'suspended':
      return 'voice.phone.status.suspended';
    default:
      return 'voice.phone.status.not_started';
  }
}

export function VoicePhoneOnboardingPanel({
  orgId,
  assistant,
  isBusy = false,
  onAssistantUpdated,
  onNavigateTest,
}: VoicePhoneOnboardingPanelProps) {
  const { t } = useLanguage();
  const [onboarding, setOnboarding] = useState<VoicePhoneOnboardingView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [areaCode, setAreaCode] = useState('30');
  const [searchResults, setSearchResults] = useState<VoicePhoneNumberSearchResult[]>([]);
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
  const [purchasePreview, setPurchasePreview] = useState<{
    maskedPhoneNumber: string | null;
    monthlyCostCents: number;
  } | null>(null);
  const [purchaseConfirm, setPurchaseConfirm] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [carrierNotes, setCarrierNotes] = useState('');
  const [loopAck, setLoopAck] = useState(false);
  const [portChecklist, setPortChecklist] = useState(false);
  const [portDocs, setPortDocs] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const view = await api.voiceAssistant.phoneOnboarding.get(orgId);
      setOnboarding(view);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshAssistant = useCallback(async () => {
    const updated = await api.voiceAssistant.get(orgId);
    onAssistantUpdated?.(updated);
    await load();
  }, [orgId, onAssistantUpdated, load]);

  const selectPath = async (path: VoicePhoneOnboardingPath) => {
    setActionBusy(true);
    setError(null);
    try {
      const view = await api.voiceAssistant.phoneOnboarding.selectPath(orgId, path);
      setOnboarding(view);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy(false);
    }
  };

  const searchNumbers = async () => {
    setActionBusy(true);
    setError(null);
    try {
      const res = await api.voiceAssistant.phoneOnboarding.searchNumbers(orgId, {
        areaCode,
        numberType: 'local',
        limit: 8,
      });
      setSearchResults(res.results);
      setSelectedToken(null);
      setPurchasePreview(null);
      setPurchaseConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy(false);
    }
  };

  const previewSelected = async (token = selectedToken) => {
    if (!token) return;
    setSelectedToken(token);
    setActionBusy(true);
    setError(null);
    try {
      const preview = await api.voiceAssistant.phoneOnboarding.previewPurchase(orgId, token);
      setPurchasePreview(preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy(false);
    }
  };

  const confirmPurchase = async () => {
    if (!selectedToken || !purchaseConfirm) return;
    setActionBusy(true);
    setError(null);
    try {
      await api.voiceAssistant.phoneOnboarding.confirmPurchase(orgId, selectedToken);
      await refreshAssistant();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy(false);
    }
  };

  const monthlyCostLabel = useMemo(() => {
    const cents = onboarding?.monthlyNumberCostCents ?? purchasePreview?.monthlyCostCents ?? 0;
    return (cents / 100).toFixed(2);
  }, [onboarding?.monthlyNumberCostCents, purchasePreview?.monthlyCostCents]);

  if (loading && !onboarding) {
    return (
      <div className="space-y-4" aria-busy="true">
        <VoiceSkeleton variant="hero" />
        <VoiceSkeleton variant="metrics" />
      </div>
    );
  }

  const status = onboarding?.status ?? 'not_started';
  const path = onboarding?.path ?? null;

  return (
    <div className="space-y-5">
      <VoiceSectionHeader
        title={t('voice.phone.title')}
        description={t('voice.phone.description')}
        actions={
          <StatusChip tone={phoneOnboardingStatusTone(status)} className="text-[9px]">
            {t(statusLabelKey(status) as 'voice.phone.status.not_started')}
          </StatusChip>
        }
      />

      {error && <VoiceInlineNotice tone="blocked">{error}</VoiceInlineNotice>}

      {onboarding?.maskedAssignedNumber && (
        <VoiceInlineNotice tone="success" title={t('voice.phone.assignedNumber')}>
          {onboarding.maskedAssignedNumber}
        </VoiceInlineNotice>
      )}

      {onboarding?.provisioningJob && status === 'reserved' && (
        <VoiceInlineNotice tone="info" title={t('voice.phone.provisioningTitle')}>
          {t('voice.phone.provisioningDesc', {
            step: onboarding.provisioningJob.currentStep ?? '—',
            pct: onboarding.provisioningJob.progressPct ?? 0,
          })}
        </VoiceInlineNotice>
      )}

      {!path && (
        <div className="grid gap-3 md:grid-cols-2">
          {PATH_OPTIONS.map(option => (
            <button
              key={option}
              type="button"
              disabled={actionBusy || isBusy}
              onClick={() => void selectPath(option)}
              className="sq-press rounded-2xl border border-border/40 p-4 text-left shadow-[var(--shadow-1)] transition-colors hover:border-[color:var(--brand)]/30"
            >
              <p className="text-[12px] font-bold text-foreground">
                {t(pathTitleKey(option) as 'voice.phone.path.newNumber.title')}
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                {t(pathDescriptionKey(option) as 'voice.phone.path.newNumber.description')}
              </p>
            </button>
          ))}
        </div>
      )}

      {path === 'new_synqdrive_number' && (
        <section className="space-y-4 rounded-2xl border border-border/40 p-4">
          <h4 className="text-[12px] font-bold">{t('voice.phone.path.newNumber.title')}</h4>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground">
                {t('voice.phone.field.country')}
              </label>
              <input className="mt-1 w-full rounded-lg border px-3 py-2 text-[11px]" value="DE" readOnly />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground">
                {t('voice.phone.field.areaCode')}
              </label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 text-[11px]"
                value={areaCode}
                onChange={e => setAreaCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
                inputMode="numeric"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                className="sq-press w-full rounded-lg border px-3 py-2 text-[11px] font-semibold"
                disabled={actionBusy || isBusy}
                onClick={() => void searchNumbers()}
              >
                {t('voice.phone.searchNumbers')}
              </button>
            </div>
          </div>

          {onboarding?.regulatoryRequirements?.length ? (
            <VoiceInlineNotice tone="warning" title={t('voice.phone.regulatoryTitle')}>
              <ul className="mt-1 list-disc pl-4 text-[10px]">
                {onboarding.regulatoryRequirements.map(req => (
                  <li key={req}>{req}</li>
                ))}
              </ul>
            </VoiceInlineNotice>
          ) : null}

          <div className="space-y-2 md:hidden">
            <Accordion type="single" collapsible>
              {searchResults.map(result => (
                <AccordionItem key={result.selectionToken} value={result.selectionToken}>
                  <AccordionTrigger className="text-[11px]">
                    {result.maskedPhoneNumber} · {result.locality ?? result.region ?? 'DE'}
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="text-[10px] text-muted-foreground">
                      {t('voice.phone.voiceCapability')}: {result.capabilities.voice ? t('voice.phone.yes') : t('voice.phone.no')}
                    </p>
                    <button
                      type="button"
                      className="mt-2 rounded-lg border px-3 py-2 text-[10px] font-semibold"
                      onClick={() => void previewSelected(result.selectionToken)}
                    >
                      {t('voice.phone.previewSelection')}
                    </button>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

          <div className="hidden space-y-2 md:block">
            {searchResults.map(result => (
              <label
                key={result.selectionToken}
                className={cn(
                  'flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-[11px]',
                  selectedToken === result.selectionToken && 'border-[color:var(--brand)]/40 bg-[color:var(--brand-soft)]/30',
                )}
              >
                <span>
                  {result.maskedPhoneNumber} · {result.locality ?? result.region ?? 'DE'}
                </span>
                <input
                  type="radio"
                  name="phone-selection"
                  checked={selectedToken === result.selectionToken}
                  onChange={() => setSelectedToken(result.selectionToken)}
                />
              </label>
            ))}
          </div>

          {selectedToken && !purchasePreview && (
            <button
              type="button"
              className="sq-press rounded-lg border px-4 py-2 text-[11px] font-semibold"
              disabled={actionBusy}
              onClick={() => void previewSelected()}
            >
              {t('voice.phone.previewSelection')}
            </button>
          )}

          {purchasePreview && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <p className="text-[11px] font-semibold">{t('voice.phone.purchasePreviewTitle')}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {purchasePreview.maskedPhoneNumber} · {t('voice.phone.monthlyCost', { amount: monthlyCostLabel })}
              </p>
              <label className="mt-3 flex items-start gap-2 text-[10px]">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={purchaseConfirm}
                  onChange={e => setPurchaseConfirm(e.target.checked)}
                />
                {t('voice.phone.purchaseConfirm')}
              </label>
              <button
                type="button"
                className="sq-press mt-3 rounded-lg border border-[color:var(--status-critical)]/40 px-4 py-2 text-[11px] font-semibold text-[color:var(--status-critical)] disabled:opacity-50"
                disabled={!purchaseConfirm || actionBusy || onboarding?.trialPurchaseBlocked}
                onClick={() => void confirmPurchase()}
              >
                {t('voice.phone.confirmPurchase')}
              </button>
            </div>
          )}
        </section>
      )}

      {path === 'forward_existing' && (
        <section className="space-y-4 rounded-2xl border border-border/40 p-4">
          <h4 className="text-[12px] font-bold">{t('voice.phone.path.forward.title')}</h4>
          <VoiceInlineNotice tone="info" title={t('voice.phone.forward.targetTitle')}>
            {onboarding?.synqDriveTargetNumber ?? t('voice.phone.forward.targetPending')}
          </VoiceInlineNotice>
          <ul className="list-disc space-y-1 pl-4 text-[10px] text-muted-foreground">
            <li>{t('voice.phone.forward.ruleImmediate')}</li>
            <li>{t('voice.phone.forward.ruleBusy')}</li>
            <li>{t('voice.phone.forward.ruleNoAnswer')}</li>
            <li>{t('voice.phone.forward.ruleAfterHours')}</li>
          </ul>
          <textarea
            className="w-full rounded-lg border px-3 py-2 text-[11px]"
            rows={3}
            placeholder={t('voice.phone.forward.carrierPlaceholder')}
            value={carrierNotes}
            onChange={e => setCarrierNotes(e.target.value)}
          />
          <label className="flex items-start gap-2 text-[10px]">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={loopAck} onChange={e => setLoopAck(e.target.checked)} />
            {t('voice.phone.forward.loopProtection')}
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="sq-press rounded-lg border px-3 py-2 text-[10px] font-semibold"
              disabled={actionBusy}
              onClick={() =>
                void api.voiceAssistant.phoneOnboarding
                  .updateForward(orgId, { carrierNotes, loopProtectionAcknowledged: loopAck })
                  .then(setOnboarding)
              }
            >
              {t('voice.common.save')}
            </button>
            <button
              type="button"
              className="sq-press rounded-lg border px-3 py-2 text-[10px] font-semibold"
              disabled={actionBusy}
              onClick={() =>
                void api.voiceAssistant.phoneOnboarding
                  .recordForwardTest(orgId, 'passed')
                  .then(setOnboarding)
              }
            >
              {t('voice.phone.forward.testPassed')}
            </button>
          </div>
        </section>
      )}

      {path === 'port_number' && (
        <section className="space-y-4 rounded-2xl border border-border/40 p-4">
          <h4 className="text-[12px] font-bold">{t('voice.phone.path.port.title')}</h4>
          <VoiceInlineNotice tone="warning" title={t('voice.phone.port.timelineTitle')}>
            {t('voice.phone.port.timelineDesc')}
          </VoiceInlineNotice>
          <ul className="list-disc space-y-1 pl-4 text-[10px] text-muted-foreground">
            <li>{t('voice.phone.port.docLoa')}</li>
            <li>{t('voice.phone.port.docInvoice')}</li>
            <li>{t('voice.phone.port.docId')}</li>
            <li>{t('voice.phone.port.deRestriction')}</li>
          </ul>
          <label className="flex items-start gap-2 text-[10px]">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={portChecklist} onChange={e => setPortChecklist(e.target.checked)} />
            {t('voice.phone.port.checklistAck')}
          </label>
          <label className="flex items-start gap-2 text-[10px]">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={portDocs} onChange={e => setPortDocs(e.target.checked)} />
            {t('voice.phone.port.docsSubmitted')}
          </label>
          <button
            type="button"
            className="sq-press rounded-lg border px-3 py-2 text-[10px] font-semibold"
            disabled={actionBusy || !portChecklist}
            onClick={() =>
              void api.voiceAssistant.phoneOnboarding
                .updatePort(orgId, { checklistAcknowledged: portChecklist, documentsSubmitted: portDocs })
                .then(setOnboarding)
            }
          >
            {t('voice.phone.port.submit')}
          </button>
        </section>
      )}

      {path === 'sip_pbx' && (
        <section className="space-y-3 rounded-2xl border border-border/40 p-4">
          <h4 className="text-[12px] font-bold">{t('voice.phone.path.sip.title')}</h4>
          <p className="text-[11px] text-muted-foreground">{t('voice.phone.path.sip.description')}</p>
          <VoiceInlineNotice tone="info">{t('voice.phone.sip.enterpriseProcess')}</VoiceInlineNotice>
        </section>
      )}

      {path && status !== 'active' && (
        <p className="text-[10px] text-muted-foreground">{t('voice.phone.pathLockedHint')}</p>
      )}

      {onNavigateTest && (
        <div className="rounded-2xl border border-border/40 p-4">
          <p className="text-[11px] text-muted-foreground">{t('voice.phone.testHint')}</p>
          <button
            type="button"
            onClick={onNavigateTest}
            className="sq-press mt-3 inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-[11px] font-semibold"
          >
            <Icon name="mic" className="h-3.5 w-3.5" />
            {t('voice.phone.openTestCenter')}
          </button>
        </div>
      )}
    </div>
  );
}

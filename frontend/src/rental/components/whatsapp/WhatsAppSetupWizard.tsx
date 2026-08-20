import { useState } from 'react';
import { Icon } from '../ui/Icon';
import { StatusChip } from '../../../components/patterns';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { WhatsAppConfig } from '../../../lib/api';
import { labelAiMode, localizedAiModeMeta } from './whatsapp-i18n';

interface WhatsAppSetupWizardProps {
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onComplete: (data: {
    phoneNumber: string;
    businessName?: string;
    phoneNumberId?: string;
    wabaId?: string;
    aiMode: WhatsAppConfig['aiMode'];
  }) => void;
}

export function WhatsAppSetupWizard({ open, saving, onClose, onComplete }: WhatsAppSetupWizardProps) {
  const { locale, t } = useLanguage();
  const [step, setStep] = useState(1);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [aiMode, setAiMode] = useState<WhatsAppConfig['aiMode']>('SUGGEST_ONLY');

  const steps = [
    { id: 1, title: t('whatsapp.wizard.step.businessIdentity') },
    { id: 2, title: t('whatsapp.wizard.step.providerCredentials') },
    { id: 3, title: t('whatsapp.wizard.step.webhookHealth') },
    { id: 4, title: t('whatsapp.wizard.step.aiMode') },
    { id: 5, title: t('whatsapp.wizard.step.finish') },
  ] as const;

  const aiModeOptions = localizedAiModeMeta(locale);

  if (!open) return null;

  const inputClass =
    'w-full rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[11px] text-foreground outline-none focus:ring-1 focus:ring-[color:var(--brand)]/30';

  const canNext =
    (step === 1 && phoneNumber.trim()) ||
    step === 2 ||
    step === 3 ||
    step === 4 ||
    step === 5;

  const handleFinish = () => {
    onComplete({
      phoneNumber: phoneNumber.trim(),
      businessName: businessName.trim() || undefined,
      phoneNumberId: phoneNumberId.trim() || undefined,
      wabaId: wabaId.trim() || undefined,
      aiMode,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 overlay-scrim" onClick={onClose} aria-hidden />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border/40 bg-popover p-6 shadow-[var(--shadow-2)]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <StatusChip tone="watch">
              {t('whatsapp.wizard.badge')}
            </StatusChip>
            <h2 className="mt-2 text-[16px] font-bold tracking-[-0.02em] text-foreground">
              {t('whatsapp.wizard.title')}
            </h2>
            <p className="text-[10px] text-muted-foreground">
              {t('whatsapp.wizard.subtitle')}
            </p>
          </div>
          <button type="button" onClick={onClose} className="sq-press rounded-lg p-1 hover:bg-muted">
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-5 flex gap-1">
          {steps.map(s => (
            <div
              key={s.id}
              className={`h-1 flex-1 rounded-full ${s.id <= step ? 'bg-[color:var(--brand)]' : 'bg-muted'}`}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-3">
            <label className="block text-[10px] font-semibold text-muted-foreground">
              {t('whatsapp.wizard.phoneLabel')}
              <input
                value={phoneNumber}
                onChange={e => setPhoneNumber(e.target.value)}
                placeholder={t('whatsapp.wizard.phonePlaceholder')}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="block text-[10px] font-semibold text-muted-foreground">
              {t('whatsapp.wizard.displayNameLabel')}
              <input
                value={businessName}
                onChange={e => setBusinessName(e.target.value)}
                placeholder={t('whatsapp.wizard.displayNamePlaceholder')}
                className={`mt-1 ${inputClass}`}
              />
            </label>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-[10px] text-muted-foreground">
              {t('whatsapp.wizard.providerHint')}
            </p>
            <label className="block text-[10px] font-semibold text-muted-foreground">
              {t('whatsapp.wizard.phoneNumberId')}
              <input value={phoneNumberId} onChange={e => setPhoneNumberId(e.target.value)} className={`mt-1 ${inputClass}`} />
            </label>
            <label className="block text-[10px] font-semibold text-muted-foreground">
              {t('whatsapp.wizard.wabaId')}
              <input value={wabaId} onChange={e => setWabaId(e.target.value)} className={`mt-1 ${inputClass}`} />
            </label>
          </div>
        )}

        {step === 3 && (
          <div className="rounded-xl border border-border/40 bg-muted/15 p-4 text-[11px] text-muted-foreground">
            <p className="font-semibold text-foreground">{t('whatsapp.wizard.webhookTitle')}</p>
            <p className="mt-1 font-mono text-[10px]">{t('whatsapp.wizard.webhookPath')}</p>
            <p className="mt-3">
              {t('whatsapp.wizard.webhookInstructions')}
            </p>
          </div>
        )}

        {step === 4 && (
          <div className="grid gap-2">
            {aiModeOptions.map(meta => (
              <button
                key={meta.mode}
                type="button"
                onClick={() => setAiMode(meta.mode)}
                className={`sq-press rounded-xl border p-3 text-left ${
                  aiMode === meta.mode ? 'border-[color:var(--brand)]/40 bg-[color:var(--brand)]/[0.05]' : 'border-border/40'
                }`}
              >
                <p className="text-[11px] font-semibold text-foreground">{meta.label}</p>
                <p className="text-[10px] text-muted-foreground">{meta.description}</p>
              </button>
            ))}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-2 text-[11px]">
            <p className="text-foreground">{t('whatsapp.wizard.reviewTitle')}</p>
            <ul className="list-inside list-disc text-muted-foreground">
              <li>{phoneNumber}</li>
              {businessName && <li>{businessName}</li>}
              {phoneNumberId && <li>{t('whatsapp.wizard.reviewPhoneIdConfigured')}</li>}
              <li>{t('whatsapp.wizard.reviewAi', { mode: labelAiMode(locale, aiMode) })}</li>
            </ul>
            <p className="text-[10px] text-[color:var(--status-watch)]">
              {t('whatsapp.wizard.tokenWarning')}
            </p>
          </div>
        )}

        <div className="mt-6 flex justify-between gap-2">
          <button
            type="button"
            disabled={step === 1}
            onClick={() => setStep(s => Math.max(1, s - 1))}
            className="sq-press rounded-xl border border-border/60 px-3 py-2 text-[11px] font-semibold text-muted-foreground disabled:opacity-40"
          >
            {t('whatsapp.wizard.back')}
          </button>
          {step < 5 ? (
            <button
              type="button"
              disabled={!canNext}
              onClick={() => setStep(s => Math.min(5, s + 1))}
              className="sq-press rounded-xl bg-[color:var(--brand)] px-4 py-2 text-[11px] font-semibold text-white disabled:opacity-40"
            >
              {t('whatsapp.wizard.continue')}
            </button>
          ) : (
            <button
              type="button"
              disabled={saving || !phoneNumber.trim()}
              onClick={handleFinish}
              className="sq-press rounded-xl bg-[color:var(--status-positive)] px-4 py-2 text-[11px] font-semibold text-white disabled:opacity-40"
            >
              {saving ? t('whatsapp.wizard.saving') : t('whatsapp.wizard.complete')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Icon } from '../ui/Icon';
import { StatusChip } from '../../../components/patterns';
import type { WhatsAppConfig } from '../../../lib/api';
import { AI_MODE_META } from './whatsapp.ops';

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

const STEPS = [
  { id: 1, title: 'Business identity' },
  { id: 2, title: 'Provider credentials' },
  { id: 3, title: 'Webhook health' },
  { id: 4, title: 'AI mode' },
  { id: 5, title: 'Finish' },
] as const;

export function WhatsAppSetupWizard({ open, saving, onClose, onComplete }: WhatsAppSetupWizardProps) {
  const [step, setStep] = useState(1);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [aiMode, setAiMode] = useState<WhatsAppConfig['aiMode']>('SUGGEST_ONLY');

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
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border/40 bg-card p-6 shadow-[var(--shadow-2)]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <StatusChip tone="watch">
              Manual configuration
            </StatusChip>
            <h2 className="mt-2 text-[16px] font-bold tracking-[-0.02em] text-foreground">
              WhatsApp setup wizard
            </h2>
            <p className="text-[10px] text-muted-foreground">
              Meta Embedded Signup not yet available — configure provider fields manually.
            </p>
          </div>
          <button type="button" onClick={onClose} className="sq-press rounded-lg p-1 hover:bg-muted">
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-5 flex gap-1">
          {STEPS.map(s => (
            <div
              key={s.id}
              className={`h-1 flex-1 rounded-full ${s.id <= step ? 'bg-[color:var(--brand)]' : 'bg-muted'}`}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-3">
            <label className="block text-[10px] font-semibold text-muted-foreground">
              Business phone number *
              <input
                value={phoneNumber}
                onChange={e => setPhoneNumber(e.target.value)}
                placeholder="+49 170 1234567"
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="block text-[10px] font-semibold text-muted-foreground">
              Business display name
              <input
                value={businessName}
                onChange={e => setBusinessName(e.target.value)}
                placeholder="SynqDrive Rental"
                className={`mt-1 ${inputClass}`}
              />
            </label>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-[10px] text-muted-foreground">
              Server-side tokens are set via environment variables. Enter Meta IDs for webhook routing.
            </p>
            <label className="block text-[10px] font-semibold text-muted-foreground">
              Phone Number ID (Meta)
              <input value={phoneNumberId} onChange={e => setPhoneNumberId(e.target.value)} className={`mt-1 ${inputClass}`} />
            </label>
            <label className="block text-[10px] font-semibold text-muted-foreground">
              WABA ID
              <input value={wabaId} onChange={e => setWabaId(e.target.value)} className={`mt-1 ${inputClass}`} />
            </label>
          </div>
        )}

        {step === 3 && (
          <div className="rounded-xl border border-border/40 bg-muted/15 p-4 text-[11px] text-muted-foreground">
            <p className="font-semibold text-foreground">Webhook endpoint</p>
            <p className="mt-1 font-mono text-[10px]">/api/webhooks/whatsapp</p>
            <p className="mt-3">
              Register this URL in Meta Developer Console. Verify token must match server configuration.
              Webhook health will show on the readiness strip after the first event.
            </p>
          </div>
        )}

        {step === 4 && (
          <div className="grid gap-2">
            {(Object.keys(AI_MODE_META) as WhatsAppConfig['aiMode'][]).map(key => (
              <button
                key={key}
                type="button"
                onClick={() => setAiMode(key)}
                className={`sq-press rounded-xl border p-3 text-left ${
                  aiMode === key ? 'border-[color:var(--brand)]/40 bg-[color:var(--brand)]/[0.05]' : 'border-border/40'
                }`}
              >
                <p className="text-[11px] font-semibold text-foreground">{AI_MODE_META[key].label}</p>
                <p className="text-[10px] text-muted-foreground">{AI_MODE_META[key].description}</p>
              </button>
            ))}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-2 text-[11px]">
            <p className="text-foreground">Review your setup:</p>
            <ul className="list-inside list-disc text-muted-foreground">
              <li>{phoneNumber}</li>
              {businessName && <li>{businessName}</li>}
              {phoneNumberId && <li>Phone Number ID configured</li>}
              <li>AI: {AI_MODE_META[aiMode].label}</li>
            </ul>
            <p className="text-[10px] text-[color:var(--status-watch)]">
              Outbound messages require server-side access token before they leave SynqDrive.
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
            Back
          </button>
          {step < 5 ? (
            <button
              type="button"
              disabled={!canNext}
              onClick={() => setStep(s => Math.min(5, s + 1))}
              className="sq-press rounded-xl bg-[color:var(--brand)] px-4 py-2 text-[11px] font-semibold text-white disabled:opacity-40"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              disabled={saving || !phoneNumber.trim()}
              onClick={handleFinish}
              className="sq-press rounded-xl bg-[color:var(--status-positive)] px-4 py-2 text-[11px] font-semibold text-white disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Complete setup'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

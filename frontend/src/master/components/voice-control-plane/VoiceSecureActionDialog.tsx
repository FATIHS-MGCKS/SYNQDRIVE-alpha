import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '../../../components/patterns';

export interface VoiceSecureActionRequest {
  title: string;
  description: string;
  confirmLabel: string;
  tone?: 'critical' | 'default';
  requireReason?: boolean;
  onConfirm: (reason: string) => Promise<void>;
}

interface VoiceSecureActionDialogProps {
  request: VoiceSecureActionRequest | null;
  onClose: () => void;
}

export function VoiceSecureActionDialog({ request, onClose }: VoiceSecureActionDialogProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const open = Boolean(request);
  const requireReason = request?.requireReason !== false;

  const reset = () => {
    setReason('');
    setConfirmed(false);
    setLoading(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      reset();
      onClose();
    }
  };

  const canSubmit = (!requireReason || reason.trim().length >= 3) && confirmed;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={request?.title ?? ''}
      description={request?.description}
      confirmLabel={request?.confirmLabel ?? 'Confirm'}
      tone={request?.tone ?? 'default'}
      loading={loading}
      onConfirm={async () => {
        if (!request || !canSubmit) {
          toast.error('Bitte Begründung eingeben und Bestätigung aktivieren.');
          return;
        }
        setLoading(true);
        try {
          await request.onConfirm(reason.trim());
          reset();
          onClose();
        } finally {
          setLoading(false);
        }
      }}
    >
      <div className="space-y-3">
        {requireReason && (
          <label className="block text-xs">
            <span className="mb-1 block font-semibold text-foreground">Begründung (Pflicht)</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none focus:border-[color:var(--brand)]"
              placeholder="Warum wird diese Aktion ausgeführt?"
              data-testid="voice-secure-action-reason"
            />
          </label>
        )}
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-0.5"
            data-testid="voice-secure-action-confirm-checkbox"
          />
          <span>Ich bestätige diese sichere Master-Admin-Aktion und verstehe die Auswirkungen.</span>
        </label>
      </div>
    </ConfirmDialog>
  );
}

export function createIdempotencyKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

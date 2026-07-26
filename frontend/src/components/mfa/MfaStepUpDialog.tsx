import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { api } from '../../lib/api';
import { setAuth, getStoredUser } from '../../lib/auth';
import { newIdempotencyKey, setStepUpToken } from '../../lib/mfa';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '../ui/input-otp';
import { Button } from '../ui/button';

interface MfaStepUpDialogProps {
  open: boolean;
  action?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function MfaStepUpDialog({ open, action, onClose, onSuccess }: MfaStepUpDialogProps) {
  const [code, setCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const submit = async () => {
    setError('');
    setLoading(true);
    try {
      const result = await api.account.mfa.challenge({
        code: useRecovery ? undefined : code,
        recoveryCode: useRecovery ? recoveryCode : undefined,
        idempotencyKey: newIdempotencyKey('mfa-step-up'),
      });
      setStepUpToken(result.stepUpToken);
      const user = getStoredUser();
      if (user && result.accessToken) {
        setAuth(result.accessToken, user);
      }
      setCode('');
      setRecoveryCode('');
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          <ShieldAlert className="h-5 w-5 text-amber-500" />
          <div>
            <h3 className="font-semibold">Sicherheitsbestätigung</h3>
            <p className="text-sm text-muted-foreground">
              Diese Aktion erfordert eine erneute 2FA-Bestätigung
              {action ? ` (${action})` : ''}.
            </p>
          </div>
        </div>

        {!useRecovery ? (
          <div className="space-y-3">
            <InputOTP maxLength={6} value={code} onChange={setCode}>
              <InputOTPGroup>
                {Array.from({ length: 6 }).map((_, i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>
            <button
              type="button"
              className="text-xs text-primary underline-offset-2 hover:underline"
              onClick={() => setUseRecovery(true)}
            >
              Wiederherstellungscode verwenden
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder="XXXX-XXXX"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
            />
            <button
              type="button"
              className="text-xs text-primary underline-offset-2 hover:underline"
              onClick={() => setUseRecovery(false)}
            >
              Authenticator-Code verwenden
            </button>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <div className="mt-5 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={loading}>
            Abbrechen
          </Button>
          <Button className="flex-1" onClick={submit} disabled={loading}>
            {loading ? 'Prüfe…' : 'Bestätigen'}
          </Button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { api } from '@/lib/api';
import { copyTextToClipboard, parseTotpSecretFromOtpAuthUrl } from '@/lib/totp-utils';
import { TotpQrCode } from './TotpQrCode';
import { RecoveryCodesPanel } from './RecoveryCodesPanel';

type SetupStep = 'scan' | 'verify' | 'recovery';

type TwoFactorSetupDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: () => void | Promise<void>;
};

export function TwoFactorSetupDialog({ open, onOpenChange, onCompleted }: TwoFactorSetupDialogProps) {
  const [step, setStep] = useState<SetupStep>('scan');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [savedConfirmed, setSavedConfirmed] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep('scan');
      setLoading(false);
      setError(null);
      setOtpauthUrl(null);
      setSecret(null);
      setCode('');
      setRecoveryCodes([]);
      setSavedConfirmed(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void api.account
      .setupTotp2FA()
      .then((result) => {
        if (cancelled) return;
        setOtpauthUrl(result.otpauthUrl);
        setSecret(parseTotpSecretFromOtpAuthUrl(result.otpauthUrl));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '2FA-Setup konnte nicht gestartet werden');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleVerify = async () => {
    if (code.length !== 6) {
      setError('Bitte geben Sie den 6-stelligen Code ein.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api.account.verifyTotp2FA({ code });
      setRecoveryCodes(result.recoveryCodes);
      setStep('recovery');
      toast.success('Zwei-Faktor-Authentifizierung aktiviert');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Code konnte nicht bestätigt werden');
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = async () => {
    setRecoveryCodes([]);
    setCode('');
    setSecret(null);
    setOtpauthUrl(null);
    await onCompleted();
    onOpenChange(false);
  };

  const handleCopySecret = async () => {
    if (!secret) return;
    const ok = await copyTextToClipboard(secret);
    if (ok) toast.success('Schlüssel kopiert');
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>2FA einrichten</DialogTitle>
          <DialogDescription>
            {step === 'scan' && 'Schritt 1 von 3 — Authenticator-App verbinden'}
            {step === 'verify' && 'Schritt 2 von 3 — Code bestätigen'}
            {step === 'recovery' && 'Schritt 3 von 3 — Wiederherstellungscodes speichern'}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        {step === 'scan' ? (
          <div className="space-y-4">
            {loading || !otpauthUrl ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
              </div>
            ) : (
              <>
                <div className="flex justify-center">
                  <TotpQrCode key={otpauthUrl} otpauthUrl={otpauthUrl} />
                </div>
                <p className="text-center text-[11px] text-muted-foreground">
                  Scannen Sie den QR-Code mit Google Authenticator, 1Password, Authy oder einer
                  anderen TOTP-App.
                </p>
                {secret ? (
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                    <p className="text-[11px] font-medium text-foreground">Manueller Schlüssel</p>
                    <div className="mt-2 flex items-center gap-2">
                      <code className="flex-1 break-all rounded-lg bg-background/80 px-2 py-1.5 font-mono text-[11px]">
                        {secret}
                      </code>
                      <Button type="button" variant="outline" size="sm" onClick={() => void handleCopySecret()}>
                        Kopieren
                      </Button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {step === 'verify' ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Geben Sie den 6-stelligen Code aus Ihrer Authenticator-App ein.
            </p>
            <div className="flex justify-center">
              <InputOTP maxLength={6} value={code} onChange={setCode} disabled={loading}>
                <InputOTPGroup>
                  {Array.from({ length: 6 }).map((_, index) => (
                    <InputOTPSlot key={index} index={index} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
          </div>
        ) : null}

        {step === 'recovery' ? (
          <RecoveryCodesPanel
            codes={recoveryCodes}
            requireConfirmation
            confirmed={savedConfirmed}
            onConfirmedChange={setSavedConfirmed}
          />
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === 'scan' ? (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                Abbrechen
              </Button>
              <Button type="button" onClick={() => setStep('verify')} disabled={loading || !otpauthUrl}>
                Weiter
              </Button>
            </>
          ) : null}
          {step === 'verify' ? (
            <>
              <Button type="button" variant="outline" onClick={() => setStep('scan')} disabled={loading}>
                Zurück
              </Button>
              <Button type="button" onClick={() => void handleVerify()} disabled={loading || code.length !== 6}>
                {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
                Bestätigen
              </Button>
            </>
          ) : null}
          {step === 'recovery' ? (
            <Button type="button" onClick={() => void handleFinish()} disabled={!savedConfirmed}>
              Abschließen
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

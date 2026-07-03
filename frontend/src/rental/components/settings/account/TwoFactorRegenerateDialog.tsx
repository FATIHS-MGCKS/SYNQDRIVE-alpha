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
import { RecoveryCodesPanel } from './RecoveryCodesPanel';

type TwoFactorRegenerateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function TwoFactorRegenerateDialog({ open, onOpenChange }: TwoFactorRegenerateDialogProps) {
  const [totpCode, setTotpCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [savedConfirmed, setSavedConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setTotpCode('');
      setRecoveryCodes(null);
      setSavedConfirmed(false);
      setError(null);
      setLoading(false);
    }
  }, [open]);

  const handleRegenerate = async () => {
    if (totpCode.length !== 6) {
      setError('Bitte geben Sie den 6-stelligen Code ein.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api.account.regenerateRecoveryCodes({ totpCode });
      setRecoveryCodes(result.recoveryCodes);
      toast.success('Neue Wiederherstellungscodes erstellt');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Codes konnten nicht erstellt werden');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setRecoveryCodes(null);
    setTotpCode('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !loading && (next ? onOpenChange(true) : handleClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Recovery Codes neu generieren</DialogTitle>
          <DialogDescription>
            {recoveryCodes
              ? 'Speichern Sie die neuen Codes. Alte ungenutzte Codes werden ungültig.'
              : 'Bestätigen Sie die Aktion mit einem Authenticator-Code.'}
          </DialogDescription>
        </DialogHeader>

        {recoveryCodes ? (
          <RecoveryCodesPanel
            codes={recoveryCodes}
            requireConfirmation
            confirmed={savedConfirmed}
            onConfirmedChange={setSavedConfirmed}
          />
        ) : (
          <div className="space-y-4">
            <div className="flex justify-center">
              <InputOTP maxLength={6} value={totpCode} onChange={setTotpCode} disabled={loading}>
                <InputOTPGroup>
                  {Array.from({ length: 6 }).map((_, index) => (
                    <InputOTPSlot key={index} index={index} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {recoveryCodes ? (
            <Button type="button" onClick={handleClose} disabled={!savedConfirmed}>
              Schließen
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
                Abbrechen
              </Button>
              <Button type="button" onClick={() => void handleRegenerate()} disabled={loading || totpCode.length !== 6}>
                {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
                Codes erzeugen
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { api } from '@/lib/api';
import { accountFieldLabelClass, accountInputClass } from './account-ui';

type TwoFactorDisableDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: () => void | Promise<void>;
};

export function TwoFactorDisableDialog({
  open,
  onOpenChange,
  onCompleted,
}: TwoFactorDisableDialogProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setCurrentPassword('');
      setTotpCode('');
      setError(null);
      setLoading(false);
    }
  }, [open]);

  const handleDisable = async () => {
    if (!currentPassword.trim() && totpCode.length !== 6) {
      setError('Bitte geben Sie Ihr Passwort oder einen 6-stelligen Authenticator-Code ein.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.account.disableTotp2FA({
        ...(currentPassword.trim() ? { currentPassword } : {}),
        ...(totpCode.length === 6 ? { totpCode } : {}),
      });
      toast.success('Zwei-Faktor-Authentifizierung deaktiviert');
      await onCompleted();
      onOpenChange(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '2FA konnte nicht deaktiviert werden');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>2FA deaktivieren</DialogTitle>
          <DialogDescription>
            Bestätigen Sie die Deaktivierung mit Ihrem Passwort oder einem Authenticator-Code.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="disable-2fa-password" className={accountFieldLabelClass}>
              Aktuelles Passwort
            </Label>
            <Input
              id="disable-2fa-password"
              type="password"
              autoComplete="current-password"
              className={accountInputClass}
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5">
            <p className={accountFieldLabelClass}>Authenticator-Code (optional)</p>
            <div className="flex justify-center">
              <InputOTP maxLength={6} value={totpCode} onChange={setTotpCode} disabled={loading}>
                <InputOTPGroup>
                  {Array.from({ length: 6 }).map((_, index) => (
                    <InputOTPSlot key={index} index={index} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
          </div>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Abbrechen
          </Button>
          <Button type="button" variant="destructive" onClick={() => void handleDisable()} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
            2FA deaktivieren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from 'react';
import { ShieldCheck, Copy, Check } from 'lucide-react';
import { api } from '../../lib/api';
import { newIdempotencyKey } from '../../lib/mfa';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '../ui/input-otp';
import { Button } from '../ui/button';

interface MfaEnrollmentPanelProps {
  onEnrolled?: () => void;
}

export function MfaEnrollmentPanel({ onEnrolled }: MfaEnrollmentPanelProps) {
  const [step, setStep] = useState<'intro' | 'scan' | 'confirm' | 'recovery'>('intro');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [secretPreview, setSecretPreview] = useState('');
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const startEnrollment = async () => {
    setError('');
    setLoading(true);
    try {
      const result = await api.account.mfa.enrollStart();
      setOtpauthUrl(result.otpauthUrl);
      setSecretPreview(result.secretPreview);
      setStep('scan');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enrollment failed');
    } finally {
      setLoading(false);
    }
  };

  const confirmEnrollment = async () => {
    if (code.length < 6) return;
    setError('');
    setLoading(true);
    try {
      const result = await api.account.mfa.enrollConfirm(code, newIdempotencyKey('mfa-enroll'));
      setRecoveryCodes(result.recoveryCodes);
      setStep('recovery');
      onEnrolled?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  const copyRecoveryCodes = async () => {
    await navigator.clipboard.writeText(recoveryCodes.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Zwei-Faktor-Authentifizierung</h2>
          <p className="text-sm text-muted-foreground">
            Pflicht für Master-Admin-Zugriff auf Billing, Organisationen und Einstellungen.
          </p>
        </div>
      </div>

      {step === 'intro' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Verwenden Sie eine Authenticator-App (Google Authenticator, 1Password, Authy).
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={startEnrollment} disabled={loading} className="w-full">
            {loading ? 'Wird vorbereitet…' : '2FA einrichten'}
          </Button>
        </div>
      )}

      {step === 'scan' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Scannen Sie den QR-Code in Ihrer Authenticator-App oder geben Sie den Schlüssel manuell ein:
            <span className="mt-1 block font-mono text-xs text-foreground">{secretPreview}</span>
          </p>
          {otpauthUrl && (
            <a
              href={otpauthUrl}
              className="inline-flex text-sm text-primary underline-offset-2 hover:underline"
            >
              In Authenticator-App öffnen
            </a>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium">Bestätigungscode</label>
            <InputOTP maxLength={6} value={code} onChange={setCode}>
              <InputOTPGroup>
                {Array.from({ length: 6 }).map((_, i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={confirmEnrollment} disabled={loading || code.length < 6} className="w-full">
            {loading ? 'Prüfe…' : 'Aktivieren'}
          </Button>
        </div>
      )}

      {step === 'recovery' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Speichern Sie diese Wiederherstellungscodes sicher. Jeder Code ist einmalig verwendbar.
          </p>
          <div className="rounded-lg bg-muted/50 p-3 font-mono text-xs leading-6">
            {recoveryCodes.map((c) => (
              <div key={c}>{c}</div>
            ))}
          </div>
          <Button variant="outline" onClick={copyRecoveryCodes} className="w-full gap-2">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Kopiert' : 'Codes kopieren'}
          </Button>
        </div>
      )}
    </div>
  );
}

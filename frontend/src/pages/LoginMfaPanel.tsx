import { useState } from 'react';
import { ArrowLeft, ArrowRight, KeyRound, Loader2, Shield } from 'lucide-react';
import { api } from '../lib/api';
import { mapAuthErrorMessage } from '../lib/totp-utils';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '../components/ui/input-otp';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

type LoginMfaPanelProps = {
  locale: 'de' | 'en';
  mfaChallengeToken: string;
  onBack: () => void;
  onSuccess: (token: string, user: Parameters<typeof import('../lib/auth').setAuth>[1]) => void;
};

const copy = {
  de: {
    title: 'Zwei-Faktor-Authentifizierung',
    subtitle: 'Geben Sie den Code aus Ihrer Authenticator-App ein.',
    recoveryTitle: 'Wiederherstellungscode',
    recoverySubtitle: 'Geben Sie einen Ihrer gespeicherten Recovery Codes ein.',
    useRecovery: 'Recovery Code verwenden',
    useAuthenticator: 'Authenticator-Code verwenden',
    recoveryPlaceholder: 'XXXX-XXXX',
    verify: 'Bestätigen',
    back: 'Zurück zur Anmeldung',
    codeRequired: 'Bitte geben Sie einen gültigen Code ein.',
  },
  en: {
    title: 'Two-factor authentication',
    subtitle: 'Enter the code from your authenticator app.',
    recoveryTitle: 'Recovery code',
    recoverySubtitle: 'Enter one of your saved recovery codes.',
    useRecovery: 'Use recovery code',
    useAuthenticator: 'Use authenticator code',
    recoveryPlaceholder: 'XXXX-XXXX',
    verify: 'Verify',
    back: 'Back to sign in',
    codeRequired: 'Please enter a valid code.',
  },
} as const;

export function LoginMfaPanel({ locale, mfaChallengeToken, onBack, onSuccess }: LoginMfaPanelProps) {
  const t = copy[locale];
  const [mode, setMode] = useState<'totp' | 'recovery'>('totp');
  const [totpCode, setTotpCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (mode === 'totp' && totpCode.length !== 6) {
      setError(t.codeRequired);
      return;
    }
    if (mode === 'recovery' && !recoveryCode.trim()) {
      setError(t.codeRequired);
      return;
    }

    setLoading(true);
    try {
      const result = await api.auth.verify2FA({
        mfaChallengeToken,
        ...(mode === 'totp' ? { totpCode } : { recoveryCode: recoveryCode.trim() }),
      });
      onSuccess(result.token ?? result.accessToken, {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        platformRole: result.user.platformRole,
        membershipRole: result.user.membershipRole,
        organizationId: result.user.organizationId,
        organizationName: result.user.organizationName,
        organizationLogoUrl: result.user.organizationLogoUrl ?? null,
        permissions: result.user.permissions,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Verification failed';
      setError(mapAuthErrorMessage(message, locale));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-3">
      <div className="mb-1 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--brand-soft)]">
          <Shield className="h-4 w-4 text-[color:var(--brand)]" aria-hidden />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {mode === 'totp' ? t.title : t.recoveryTitle}
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {mode === 'totp' ? t.subtitle : t.recoverySubtitle}
          </p>
        </div>
      </div>

      {error ? (
        <div className="px-3 py-2 rounded-lg border border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical-soft)] text-xs text-[color:var(--status-critical)]">
          {error}
        </div>
      ) : null}

      {mode === 'totp' ? (
        <div className="flex justify-center py-1">
          <InputOTP maxLength={6} value={totpCode} onChange={setTotpCode} disabled={loading}>
            <InputOTPGroup>
              {Array.from({ length: 6 }).map((_, index) => (
                <InputOTPSlot key={index} index={index} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={recoveryCode}
              onChange={(event) => setRecoveryCode(event.target.value.toUpperCase())}
              placeholder={t.recoveryPlaceholder}
              className="pl-9 font-mono tracking-wider"
              autoComplete="one-time-code"
              disabled={loading}
            />
          </div>
        </div>
      )}

      <button
        type="button"
        className="text-[11px] font-medium text-[color:var(--brand)] hover:underline"
        onClick={() => {
          setMode((current) => (current === 'totp' ? 'recovery' : 'totp'));
          setError('');
          setTotpCode('');
          setRecoveryCode('');
        }}
        disabled={loading}
      >
        {mode === 'totp' ? t.useRecovery : t.useAuthenticator}
      </button>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 rounded-lg bg-[color:var(--brand)] text-[color:var(--brand-foreground)] text-xs font-semibold hover:bg-[color:var(--brand-hover)] transition-colors duration-200 flex items-center justify-center gap-2 shadow-[var(--shadow-1)] disabled:opacity-70 mt-1 sq-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <>
            {t.verify}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </>
        )}
      </button>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full"
        onClick={onBack}
        disabled={loading}
      >
        <ArrowLeft className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        {t.back}
      </Button>
    </form>
  );
}

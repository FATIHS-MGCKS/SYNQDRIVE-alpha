import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { setAuth } from '../lib/auth';
import { Eye, EyeOff, ArrowRight, Building2, Zap } from 'lucide-react';
import { SynqDriveBrandLogo } from '../components/brand/SynqDriveBrandLogo';
import loginHeroVideo from '../assets/synqdrive-login.mp4';
import { translateAuthError } from '../i18n/auth-error-i18n';
import { LanguageSelector } from '../i18n/components/LanguageSelector';
import { useLanguage } from '../i18n/LanguageContext';

type OrganizationChoice = {
  organizationId: string;
  organizationName: string | null;
  organizationLogoUrl: string | null;
  membershipId: string;
  role: string;
};

export default function LoginPage() {
  const navigate = useNavigate();
  const { locale, t } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [organizationChoices, setOrganizationChoices] = useState<OrganizationChoice[] | null>(null);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);
  const [mfaPendingToken, setMfaPendingToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaRecoveryCode, setMfaRecoveryCode] = useState('');
  const [useMfaRecovery, setUseMfaRecovery] = useState(false);

  const completeLogin = (res: { token?: string; accessToken?: string; refreshToken?: string; user: any }) => {
    const token = res.accessToken ?? res.token;
    if (!token || !res.user) {
      throw new Error('Login response incomplete');
    }
    setAuth(token, res.user, res.refreshToken);
    if (res.user.platformRole === 'MASTER_ADMIN') navigate('/master', { replace: true });
    else if (res.user.organizationId) navigate('/rental', { replace: true });
    else navigate('/master', { replace: true });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password.trim()) {
      setError(t('auth.error.credentialsRequired'));
      return;
    }
    setLoading(true);
    try {
      const res = await api.auth.login(email.trim(), password);
      if (res.requiresOrganizationSelection) {
        setOrganizationChoices(res.organizations ?? []);
        setSelectedOrganizationId(res.suggestedOrganizationId ?? res.organizations?.[0]?.organizationId ?? null);
        return;
      }
      if (res.requiresMfa && res.mfaPendingToken) {
        setMfaPendingToken(res.mfaPendingToken);
        return;
      }
      if (!res.user) {
        throw new Error('Login response incomplete');
      }
      completeLogin({
        token: res.token,
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        user: res.user,
      });
    } catch (err: unknown) {
      setError(translateAuthError(locale, err));
    } finally {
      setLoading(false);
    }
  };

  const handleOrganizationContinue = async () => {
    if (!selectedOrganizationId) {
      setError(t('auth.error.organizationRequired'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.auth.login(email.trim(), password, selectedOrganizationId);
      if (res.requiresOrganizationSelection) {
        throw new Error('Organization selection still required');
      }
      if (!res.user) {
        throw new Error('Login response incomplete');
      }
      completeLogin({
        token: res.token,
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        user: res.user,
      });
    } catch (err: unknown) {
      setError(translateAuthError(locale, err));
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaPendingToken) return;
    setError('');
    setLoading(true);
    try {
      const res = await api.auth.loginMfa({
        mfaPendingToken,
        code: useMfaRecovery ? undefined : mfaCode,
        recoveryCode: useMfaRecovery ? mfaRecoveryCode : undefined,
      });
      completeLogin(res);
    } catch (err: unknown) {
      setError(translateAuthError(locale, err));
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2 text-xs text-foreground bg-[color:var(--input-background)] border border-border rounded-lg focus:bg-background focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--ring)] outline-none transition-all duration-200 placeholder:text-muted-foreground';

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 lg:p-8 relative overflow-hidden bg-background">
      <div
        className="pointer-events-none fixed inset-0 opacity-80"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 85% 10%, color-mix(in srgb, var(--brand) 8%, transparent), transparent 55%), radial-gradient(ellipse 70% 50% at 5% 95%, color-mix(in srgb, var(--brand) 5%, transparent), transparent 50%), var(--background)',
        }}
      />
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.35]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--foreground) 6%, transparent) 0.5px, transparent 0)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="fixed top-5 right-6 z-50">
        <LanguageSelector variant="login-menu" />
      </div>

      <div className="relative w-full max-w-[820px] min-h-[440px] rounded-[20px] overflow-hidden z-10 origin-center md:scale-[1.2] surface-frosted border border-border shadow-[var(--shadow-2)]">
        <div className="flex min-h-[460px]">
          <div className="hidden lg:flex lg:w-[360px] relative overflow-hidden rounded-[14px] m-2 bg-black">
            <video
              src={loginHeroVideo}
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              aria-hidden
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/25 to-black/90" />
            <div className="relative z-10 flex flex-col justify-end p-6 h-full">
              <div className="space-y-3">
                <div
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/15 shadow-sm"
                  style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(12px)' }}
                >
                  <Zap className="w-3 h-3 text-[color:var(--brand)]" />
                  <span className="text-[10px] text-white/90 font-medium tracking-wide">{t('login.fleetManagement')}</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight leading-snug drop-shadow-md">
                    {t('login.headline')}
                    <br />
                    {t('login.headlineBr')}
                  </h2>
                  <p className="text-xs text-white/80 mt-2 leading-relaxed max-w-[280px] drop-shadow">
                    {t('login.subPart1')}{' '}
                    <span className="text-white font-semibold">{t('login.subHighlight1')}</span> {t('login.subAnd')}{' '}
                    <span className="text-white font-semibold">{t('login.subHighlight2')}</span>
                    <span className="text-white/50 mx-1">&mdash;</span>
                    {t('login.subPart2')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center px-5 sm:px-7 lg:px-9 py-5">
            <div className="w-full max-w-[280px]">
              <div className="flex items-center justify-center mb-5">
                <SynqDriveBrandLogo className="h-5 w-auto object-contain" />
              </div>

              {!organizationChoices && !mfaPendingToken ? (
                <>
                  <div className="mb-4 text-center">
                    <h1 className="text-sm font-bold tracking-tight text-foreground">{t('login.welcomeBack')}</h1>
                    <p className="text-[11px] text-muted-foreground mt-1">{t('login.subtitle')}</p>
                  </div>
                  <form onSubmit={handleSubmit} className="space-y-2.5">
                    {error && (
                      <div className="px-3 py-2 rounded-lg border border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical-soft)] text-xs text-[color:var(--status-critical)]">
                        {error}
                      </div>
                    )}
                    <div className="space-y-1">
                      <label className="text-[10px] font-medium text-muted-foreground tracking-wide pl-0.5">{t('login.email')}</label>
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('login.emailPlaceholder')} className={inputClass} autoComplete="email" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-medium text-muted-foreground tracking-wide pl-0.5">{t('login.password')}</label>
                      <div className="relative">
                        <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('login.passwordPlaceholder')} className={`${inputClass} pr-8`} autoComplete="current-password" />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-muted" aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}>
                          {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    <button type="submit" disabled={loading} className="w-full py-2 rounded-lg bg-[color:var(--brand)] text-[color:var(--brand-foreground)] text-xs font-semibold hover:bg-[color:var(--brand-hover)] transition-colors duration-200 flex items-center justify-center gap-2 shadow-[var(--shadow-1)] disabled:opacity-70 mt-1 sq-press">
                      {loading ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>{t('login.logIn')}<ArrowRight className="w-3.5 h-3.5" /></>}
                    </button>
                  </form>
                </>
              ) : mfaPendingToken ? (
                <>
                  <div className="mb-4 text-center">
                    <h1 className="text-sm font-bold tracking-tight text-foreground">{t('twoFactor.title')}</h1>
                    <p className="text-[11px] text-muted-foreground mt-1">{t('twoFactor.subtitle')}</p>
                  </div>
                  <form onSubmit={handleMfaSubmit} className="space-y-2.5">
                    {error && (
                      <div className="px-3 py-2 rounded-lg border border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical-soft)] text-xs text-[color:var(--status-critical)]">
                        {error}
                      </div>
                    )}
                    {!useMfaRecovery ? (
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        value={mfaCode}
                        onChange={(e) => setMfaCode(e.target.value.replace(/\s+/g, ''))}
                        placeholder={t('twoFactor.codePlaceholder')}
                        className={inputClass}
                        maxLength={6}
                      />
                    ) : (
                      <input
                        type="text"
                        value={mfaRecoveryCode}
                        onChange={(e) => setMfaRecoveryCode(e.target.value)}
                        placeholder={t('twoFactor.recoveryPlaceholder')}
                        className={inputClass}
                      />
                    )}
                    <button
                      type="button"
                      className="text-[10px] text-[color:var(--brand)]"
                      onClick={() => setUseMfaRecovery((v) => !v)}
                    >
                      {useMfaRecovery ? t('twoFactor.useAuthenticator') : t('twoFactor.useRecovery')}
                    </button>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setMfaPendingToken(null);
                          setMfaCode('');
                          setMfaRecoveryCode('');
                          setError('');
                        }}
                        className="flex-1 py-2 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
                      >
                        {t('login.back')}
                      </button>
                      <button
                        type="submit"
                        disabled={loading || (!useMfaRecovery ? mfaCode.length < 6 : !mfaRecoveryCode.trim())}
                        className="flex-1 py-2 rounded-lg bg-[color:var(--brand)] text-[color:var(--brand-foreground)] text-xs font-semibold hover:bg-[color:var(--brand-hover)] transition-colors disabled:opacity-70"
                      >
                        {loading ? <div className="mx-auto w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : t('login.continue')}
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <>
                  <div className="mb-4 text-center">
                    <h1 className="text-sm font-bold tracking-tight text-foreground">{t('login.chooseOrg.title')}</h1>
                    <p className="text-[11px] text-muted-foreground mt-1">{t('login.chooseOrg.subtitle')}</p>
                  </div>
                  {error && (
                    <div className="mb-3 px-3 py-2 rounded-lg border border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical-soft)] text-xs text-[color:var(--status-critical)]">
                      {error}
                    </div>
                  )}
                  <div className="space-y-2 mb-3">
                    {(organizationChoices ?? []).map((org) => {
                      const active = selectedOrganizationId === org.organizationId;
                      return (
                        <button
                          key={org.organizationId}
                          type="button"
                          onClick={() => setSelectedOrganizationId(org.organizationId)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                            active
                              ? 'border-[color:var(--brand)] bg-[color:var(--brand-soft)]'
                              : 'border-border hover:border-muted-foreground/30'
                          }`}
                        >
                          <Building2 className="w-4 h-4 text-[color:var(--brand)] shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium truncate">{org.organizationName || org.organizationId}</div>
                            <div className="text-[10px] text-muted-foreground">{org.role}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setOrganizationChoices(null); setError(''); }} className="flex-1 py-2 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors">
                      {t('login.back')}
                    </button>
                    <button type="button" onClick={handleOrganizationContinue} disabled={loading || !selectedOrganizationId} className="flex-1 py-2 rounded-lg bg-[color:var(--brand)] text-[color:var(--brand-foreground)] text-xs font-semibold hover:bg-[color:var(--brand-hover)] transition-colors disabled:opacity-70">
                      {loading ? <div className="mx-auto w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : t('login.continue')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="fixed bottom-4 text-center w-full z-10">
        <p className="text-[10px] text-muted-foreground">{t('login.footer')}</p>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { setAuth } from '../lib/auth';
import { Eye, EyeOff, ArrowRight, Car, Zap, Shield, Globe, Building2 } from 'lucide-react';
import { SynqDriveBrandLogo } from '../components/brand/SynqDriveBrandLogo';
import loginHeroVideo from '../assets/synqdrive-login.mp4';

const loginCopy: Record<string, { en: string; de: string }> = {
  fleetManagement: { en: 'LIVE FLEET INTELLIGENCE', de: 'LIVE FLOTTEN-INTELLIGENZ' },
  headline: { en: 'See your fleet', de: 'Sehen Sie Ihre Flotte' },
  headlineBr: { en: 'in real time.', de: 'in Echtzeit.' },
  subPart1: { en: 'Live telemetry,', de: 'Live-Telemetrie,' },
  subHighlight1: { en: 'AI analytics', de: 'KI-Analyse' },
  subAnd: { en: 'and', de: 'und' },
  subHighlight2: { en: 'smart automation', de: 'smarte Automatisierung' },
  subPart2: { en: 'in one platform.', de: 'in einer Plattform.' },
  pillFleet: { en: 'Live Tracking', de: 'Live-Tracking' },
  pillSecure: { en: 'Secure', de: 'Sicher' },
  pillRealtime: { en: 'Real-time', de: 'Echtzeit' },
  trustHeadline: { en: 'Fleet operations in one workspace', de: 'Flottenbetrieb in einer Oberfläche' },
  trustSubtitle: { en: 'Telemetry, rentals, health and tasks — connected', de: 'Telemetrie, Vermietung, Health und Tasks — verbunden' },
  welcomeBack: { en: 'Welcome Back!', de: 'Willkommen zurück!' },
  subtitle: { en: 'Enter your details below to sign in.', de: 'Geben Sie Ihre Daten ein, um sich anzumelden.' },
  chooseOrgTitle: { en: 'Choose your organization', de: 'Organisation auswählen' },
  chooseOrgSubtitle: {
    en: 'Your account has access to multiple organizations. Select where you want to work.',
    de: 'Ihr Konto hat Zugriff auf mehrere Organisationen. Wählen Sie Ihren Arbeitsbereich.',
  },
  continue: { en: 'Continue', de: 'Weiter' },
  back: { en: 'Back', de: 'Zurück' },
  email: { en: 'Email', de: 'E-Mail' },
  password: { en: 'Password', de: 'Passwort' },
  emailPlaceholder: { en: 'name@company.com', de: 'name@unternehmen.com' },
  passwordPlaceholder: { en: '••••••••', de: '••••••••' },
  rememberMe: { en: 'Remember me', de: 'Angemeldet bleiben' },
  forgotPassword: { en: 'Forgot password?', de: 'Passwort vergessen?' },
  logIn: { en: 'Log in', de: 'Anmelden' },
  or: { en: 'or', de: 'oder' },
  footer: { en: '© 2026 SYNQDRIVE · Multi-Tenant Fleet Management SaaS', de: '© 2026 SYNQDRIVE · Multi-Mandanten-Flottenmanagement SaaS' },
};

type OrganizationChoice = {
  organizationId: string;
  organizationName: string | null;
  organizationLogoUrl: string | null;
  membershipId: string;
  role: string;
};

export default function LoginPage() {
  const navigate = useNavigate();
  const [locale, setLocale] = useState<'en' | 'de'>('de');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [organizationChoices, setOrganizationChoices] = useState<OrganizationChoice[] | null>(null);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);

  const t = (key: keyof typeof loginCopy) => loginCopy[key]?.[locale] ?? loginCopy[key]?.en ?? '';

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
      setError(locale === 'de' ? 'Bitte E-Mail und Passwort eingeben.' : 'Please enter email and password.');
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
      completeLogin(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleOrganizationContinue = async () => {
    if (!selectedOrganizationId) {
      setError(locale === 'de' ? 'Bitte eine Organisation auswählen.' : 'Please select an organization.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.auth.login(email.trim(), password, selectedOrganizationId);
      if (res.requiresOrganizationSelection) {
        throw new Error('Organization selection still required');
      }
      completeLogin(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
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
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowLangMenu(!showLangMenu)}
            className="surface-frosted flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border shadow-[var(--shadow-1)] hover:border-border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
          >
            <Globe className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="inline-flex h-4 min-w-[22px] items-center justify-center rounded-sm bg-muted px-1 font-mono text-[9px] font-semibold tracking-[0.08em] text-muted-foreground">
              {locale === 'de' ? 'DE' : 'EN'}
            </span>
            <span className="text-xs text-foreground font-medium">
              {locale === 'de' ? 'Deutsch' : 'English'}
            </span>
          </button>
          {showLangMenu && (
            <>
              <div className="fixed inset-0" onClick={() => setShowLangMenu(false)} aria-hidden />
              <div className="absolute right-0 top-full mt-2 w-44 rounded-xl border border-border bg-popover shadow-[var(--shadow-2)] overflow-hidden animate-fade-up">
                <button
                  type="button"
                  onClick={() => { setLocale('en'); setShowLangMenu(false); }}
                  className={`w-full flex items-center gap-2.5 px-4 py-3 text-xs font-medium text-left transition-all duration-150 ${locale === 'en' ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]' : 'text-muted-foreground hover:bg-muted'}`}
                >
                  <span className="font-mono text-[10px] tracking-[0.08em] opacity-70">EN</span> English
                </button>
                <button
                  type="button"
                  onClick={() => { setLocale('de'); setShowLangMenu(false); }}
                  className={`w-full flex items-center gap-2.5 px-4 py-3 text-xs font-medium text-left transition-all duration-150 ${locale === 'de' ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]' : 'text-muted-foreground hover:bg-muted'}`}
                >
                  <span className="font-mono text-[10px] tracking-[0.08em] opacity-70">DE</span> Deutsch
                </button>
              </div>
            </>
          )}
        </div>
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
                  <span className="text-[10px] text-white/90 font-medium tracking-wide">{t('fleetManagement')}</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight leading-snug drop-shadow-md">
                    {t('headline')}<br />{t('headlineBr')}
                  </h2>
                  <p className="text-xs text-white/80 mt-2 leading-relaxed max-w-[280px] drop-shadow">
                    {t('subPart1')}{' '}
                    <span className="text-white font-semibold">{t('subHighlight1')}</span> {t('subAnd')}{' '}
                    <span className="text-white font-semibold">{t('subHighlight2')}</span>
                    <span className="text-white/50 mx-1">&mdash;</span>
                    {t('subPart2')}
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

              {!organizationChoices ? (
                <>
                  <div className="mb-4 text-center">
                    <h1 className="text-sm font-bold tracking-tight text-foreground">{t('welcomeBack')}</h1>
                    <p className="text-[11px] text-muted-foreground mt-1">{t('subtitle')}</p>
                  </div>
                  <form onSubmit={handleSubmit} className="space-y-2.5">
                    {error && (
                      <div className="px-3 py-2 rounded-lg border border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical-soft)] text-xs text-[color:var(--status-critical)]">
                        {error}
                      </div>
                    )}
                    <div className="space-y-1">
                      <label className="text-[10px] font-medium text-muted-foreground tracking-wide pl-0.5">{t('email')}</label>
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('emailPlaceholder')} className={inputClass} autoComplete="email" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-medium text-muted-foreground tracking-wide pl-0.5">{t('password')}</label>
                      <div className="relative">
                        <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('passwordPlaceholder')} className={`${inputClass} pr-8`} autoComplete="current-password" />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-muted" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                          {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    <button type="submit" disabled={loading} className="w-full py-2 rounded-lg bg-[color:var(--brand)] text-[color:var(--brand-foreground)] text-xs font-semibold hover:bg-[color:var(--brand-hover)] transition-colors duration-200 flex items-center justify-center gap-2 shadow-[var(--shadow-1)] disabled:opacity-70 mt-1 sq-press">
                      {loading ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>{t('logIn')}<ArrowRight className="w-3.5 h-3.5" /></>}
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <div className="mb-4 text-center">
                    <h1 className="text-sm font-bold tracking-tight text-foreground">{t('chooseOrgTitle')}</h1>
                    <p className="text-[11px] text-muted-foreground mt-1">{t('chooseOrgSubtitle')}</p>
                  </div>
                  {error && (
                    <div className="mb-3 px-3 py-2 rounded-lg border border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical-soft)] text-xs text-[color:var(--status-critical)]">
                      {error}
                    </div>
                  )}
                  <div className="space-y-2 mb-3">
                    {organizationChoices.map((org) => {
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
                      {t('back')}
                    </button>
                    <button type="button" onClick={handleOrganizationContinue} disabled={loading || !selectedOrganizationId} className="flex-1 py-2 rounded-lg bg-[color:var(--brand)] text-[color:var(--brand-foreground)] text-xs font-semibold hover:bg-[color:var(--brand-hover)] transition-colors disabled:opacity-70">
                      {loading ? <div className="mx-auto w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : t('continue')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="fixed bottom-4 text-center w-full z-10">
        <p className="text-[10px] text-muted-foreground">{t('footer')}</p>
      </div>
    </div>
  );
}

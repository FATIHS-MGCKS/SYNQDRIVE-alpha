import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { setAuth } from '../lib/auth';
import { Eye, EyeOff, ArrowRight, Car, Zap, Shield, Globe } from 'lucide-react';
import synqdriveLogoLight from '../assets/synqdrive-logo-light.png';
import synqdriveLogoDark from '../assets/synqdrive-logo-dark.png';
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
  trustCompanies: { en: '2,400+ Companies', de: '2.400+ Unternehmen' },
  trustSubtitle: { en: 'move with SYNQDRIVE', de: 'fahren mit SYNQDRIVE' },
  welcomeBack: { en: 'Welcome Back!', de: 'Willkommen zurück!' },
  subtitle: { en: 'Enter your details below to sign in.', de: 'Geben Sie Ihre Daten ein, um sich anzumelden.' },
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

export default function LoginPage() {
  const navigate = useNavigate();
  const [locale, setLocale] = useState<'en' | 'de'>('de');
  const [prefersDark, setPrefersDark] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false,
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showLangMenu, setShowLangMenu] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setPrefersDark(e.matches);
    setPrefersDark(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const t = (key: keyof typeof loginCopy) => loginCopy[key]?.[locale] ?? loginCopy[key]?.en ?? '';

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
      setAuth(res.token, res.user);
      if (res.user.platformRole === 'MASTER_ADMIN') navigate('/master', { replace: true });
      else if (res.user.organizationId) navigate('/rental', { replace: true });
      else navigate('/master', { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2 text-xs text-foreground bg-[color:var(--input-background)] border border-border rounded-lg focus:bg-card focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--ring)] outline-none transition-all duration-200 placeholder:text-muted-foreground';

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 lg:p-8 relative overflow-hidden bg-background">
      {/* Ambient brand moment — allowed glass/gradient on login only */}
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

      {/* Language Switcher */}
      <div className="fixed top-5 right-6 z-50">
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowLangMenu(!showLangMenu)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border bg-card/80 backdrop-blur-md shadow-[var(--shadow-1)] hover:bg-card hover:border-border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
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

      {/* Main Card
          Scaled to 120% via CSS transform on md+ so all inner proportions
          (video, typography, pills, form fields, spacing) enlarge uniformly
          without needing to touch every utility class. On small viewports we
          keep the original size so the card does not overflow the root's
          overflow-hidden container. */}
      <div
        className="relative w-full max-w-[820px] min-h-[440px] rounded-[20px] overflow-hidden z-10 origin-center md:scale-[1.2] sq-glass border border-border shadow-[var(--shadow-2)]"
      >
        <div className="flex min-h-[460px]">
          {/* Left Panel */}
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
            {/* Gradient focused on the bottom 40% so the upper portion of the
                video stays visually unobstructed. */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/25 to-black/90" />

            <div className="relative z-10 flex flex-col justify-end p-6 h-full">
              {/* Content block — anchored to the bottom 40% of the panel */}
              <div className="space-y-3">
                <div
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/15 shadow-sm"
                  style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(12px)' }}
                >
                  <Zap className="w-3 h-3 text-blue-300" />
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

                <div className="flex flex-wrap gap-1.5">
                  {[
                    { icon: Car, label: t('pillFleet') },
                    { icon: Shield, label: t('pillSecure') },
                    { icon: Zap, label: t('pillRealtime') },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center gap-1 px-2 py-1 rounded-md border border-white/20 shadow-sm"
                      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(12px)' }}
                    >
                      <item.icon className="w-2.5 h-2.5 text-white/80" />
                      <span className="text-[10px] text-white/90 font-medium">{item.label}</span>
                    </div>
                  ))}
                </div>

                <div
                  className="inline-flex items-center gap-2 p-2 rounded-xl border border-white/15 shadow-lg"
                  style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)' }}
                >
                  <div className="flex -space-x-1.5">
                    {['#2563EB', '#3b82f6', '#60a5fa', '#93c5fd'].map((color, i) => (
                      <div
                        key={i}
                        className="w-5 h-5 rounded-full border border-black/20 flex items-center justify-center text-[8px] font-bold text-white shadow-sm"
                        style={{ background: color }}
                      >
                        {['M', 'A', 'J', 'K'][i]}
                      </div>
                    ))}
                  </div>
                  <div className="pr-2">
                    <span className="block text-[10px] text-white/90 font-medium leading-none mb-0.5">{t('trustCompanies')}</span>
                    <span className="block text-[8px] text-white/60 leading-none">{t('trustSubtitle')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel */}
          <div className="flex-1 flex flex-col items-center justify-center px-5 sm:px-7 lg:px-9 py-5">
            <div className="w-full max-w-[280px]">
              {/* Logo */}
              <div className="flex items-center justify-center mb-5">
                <img
                  src={prefersDark ? synqdriveLogoDark : synqdriveLogoLight}
                  alt="SYNQDRIVE"
                  className="h-5 w-auto object-contain"
                />
              </div>

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
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('emailPlaceholder')}
                    className={inputClass}
                    autoComplete="email"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground tracking-wide pl-0.5">{t('password')}</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t('passwordPlaceholder')}
                      className={`${inputClass} pr-8`}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 cursor-pointer group">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setRememberMe(!rememberMe)}
                      onKeyDown={(e) => e.key === 'Enter' && setRememberMe((v) => !v)}
                      className={`w-[14px] h-[14px] rounded border-[1.5px] flex items-center justify-center transition-all duration-200 cursor-pointer ${
                        rememberMe ? 'bg-[color:var(--brand)] border-[color:var(--brand)]' : 'border-border group-hover:border-muted-foreground'
                      }`}
                    >
                      {rememberMe && (
                        <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground font-medium">{t('rememberMe')}</span>
                  </label>
                  <button
                    type="button"
                    className="text-[10px] text-muted-foreground hover:text-foreground font-medium transition-colors"
                    onClick={() => setError(locale === 'de' ? 'Bitte wenden Sie sich an den Support.' : 'Please contact support.')}
                  >
                    {t('forgotPassword')}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2 rounded-lg bg-[color:var(--brand)] text-[color:var(--brand-foreground)] text-xs font-semibold hover:bg-[color:var(--brand-hover)] transition-colors duration-200 flex items-center justify-center gap-2 shadow-[var(--shadow-1)] disabled:opacity-70 mt-1 sq-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {loading ? (
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      {t('logIn')}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>

                <div className="flex items-center gap-3 py-0.5">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[9px] text-muted-foreground font-medium tracking-wider uppercase">{t('or')}</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled
                    className="flex-1 py-1.5 rounded-lg border border-border bg-card text-xs font-medium text-muted-foreground flex items-center justify-center gap-2 shadow-[var(--shadow-1)] cursor-not-allowed"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    <span className="hidden sm:inline">Google</span>
                  </button>
                  <button
                    type="button"
                    disabled
                    className="flex-1 py-1.5 rounded-lg border border-border bg-card text-xs font-medium text-muted-foreground flex items-center justify-center gap-2 shadow-[var(--shadow-1)] cursor-not-allowed"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                      <rect x="1" y="1" width="10" height="10" fill="#F25022"/>
                      <rect x="13" y="1" width="10" height="10" fill="#7FBA00"/>
                      <rect x="1" y="13" width="10" height="10" fill="#00A4EF"/>
                      <rect x="13" y="13" width="10" height="10" fill="#FFB900"/>
                    </svg>
                    <span className="hidden sm:inline">Microsoft</span>
                  </button>
                </div>
              </form>
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

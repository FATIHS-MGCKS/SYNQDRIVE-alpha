/**
 * E6C Driver Influence UI — a LAZY, privacy-aware surface over the canonical E5B
 * driver-analysis result (a SEPARATE direct request, never the summary's embedded
 * `driverInfluence`). No driver request is issued until the user explicitly reveals
 * the panel; after the first reveal the content stays mounted so collapse/reopen does
 * NOT refetch. Everything is server-authoritative: `piiTier` and `driverRef` are
 * rendered verbatim; the frontend never derives the tier from roles/permissions,
 * never joins `driverRef` to a person/customer/booking/invoice, never resolves a
 * pseudonym, and never fetches identity data. Language is association-only (no causal
 * claims). Server order of factors is preserved (no re-rank/normalize/redistribute).
 * Transport: 403→UNAUTHORIZED, 404→NOT_FOUND (never FEATURE_DISABLED), else→ERROR.
 */
import { useState } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import { useEvaluationsDriverInfluence } from '../../hooks/useEvaluationsCanonicalAnalytics';
import type { EvaluationsAnalyticsRequest } from '../../lib/evaluations/evaluations-request';
import type {
  EvaluationsDriverInfluenceSection as DriverSection,
  E4DriverFactor,
} from '../../lib/evaluations/evaluations-canonical.types';
import { MetricStatusBadge } from './MetricStatusBadge';
import {
  driverPiiTierLabelKey,
  driverRelationshipLabelKey,
  toneClassName,
} from './evaluations-presentation';

const DRIVER_PANEL_ID = 'evaluations-driver-influence-panel';

function TransportMessage({ state }: { state: 'UNAUTHORIZED' | 'NOT_FOUND' | 'FEATURE_DISABLED' | 'ERROR' }) {
  const { t } = useLanguage();
  const key: TranslationKey =
    state === 'UNAUTHORIZED'
      ? 'evaluations.availability.unauthorized'
      : state === 'NOT_FOUND' || state === 'FEATURE_DISABLED'
        ? 'evaluations.availability.notFound'
        : 'evaluations.availability.error';
  return (
    <p className="text-sm text-[var(--muted-foreground)]" role="status">
      {t(key)}
    </p>
  );
}

function FactorRow({ factor, showRef }: { factor: E4DriverFactor; showRef: boolean }) {
  const { t, locale } = useLanguage();
  return (
    <li
      className="rounded-lg border border-[var(--border)] p-2 flex items-start justify-between gap-2"
      data-testid="evaluations-driver-factor"
    >
      <div className="min-w-0">
        {/* driverRef rendered verbatim (opaque, server-permitted) — only when the tier
            permits any reference. Never resolved into a name/entity. */}
        {showRef ? (
          <p className="text-xs font-medium break-words">
            <code>{factor.driverRef}</code>
          </p>
        ) : null}
        <p className="text-[11px] text-[var(--muted-foreground)]">
          {factor.associatedDimension} · {t(driverRelationshipLabelKey(factor.relationship))} · n=
          {factor.sampleSize}
        </p>
      </div>
      <span className="text-xs font-semibold tabular-nums shrink-0">
        {/* associationShare is server-supplied; Intl percent is display-only. */}
        {new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(
          factor.associationShare,
        )}
      </span>
    </li>
  );
}

function DriverContent({ data }: { data: DriverSection }) {
  const { t } = useLanguage();
  // piiTier = none must expose NO factor references.
  const showRefs = data.piiTier !== 'none';
  return (
    <div className="flex flex-col gap-2" data-testid="evaluations-driver-content">
      <div className="flex items-center gap-2 flex-wrap">
        <MetricStatusBadge status={data.status} />
        <span
          className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ${toneClassName('neutral')}`}
          data-testid={`evaluations-driver-piitier-${data.piiTier}`}
        >
          {t(driverPiiTierLabelKey(data.piiTier))}
        </span>
      </div>

      {/* Server-provided disclaimer, verbatim (association-only contract text). */}
      <p className="text-[11px] text-[var(--muted-foreground)]" data-testid="evaluations-driver-disclaimer">
        {data.disclaimer}
      </p>

      {data.confounders.length > 0 ? (
        <div data-testid="evaluations-driver-confounders">
          <p className="text-[11px] font-medium text-[var(--muted-foreground)]">
            {t('evaluations.driver.confounders')}
          </p>
          <ul className="list-disc pl-4">
            {data.confounders.map((c, i) => (
              <li key={i} className="text-[11px] text-[var(--muted-foreground)] break-words">
                {c}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {data.factors.length === 0 ? (
        // Empty factors → qualified neutral copy; never "no driver influence/blame".
        <p className="text-xs text-[var(--muted-foreground)]" data-testid="evaluations-driver-empty">
          {t('evaluations.driver.emptyFactors')}
        </p>
      ) : showRefs ? (
        <ul className="flex flex-col gap-1">
          {/* Server order preserved (no re-rank / normalize / redistribute). */}
          {data.factors.map((f, i) => (
            <FactorRow key={`${f.driverRef}-${i}`} factor={f} showRef />
          ))}
        </ul>
      ) : (
        // piiTier = none: associations exist but no references may be shown.
        <p className="text-xs text-[var(--muted-foreground)]" data-testid="evaluations-driver-none-restricted">
          {t('evaluations.driver.noneRestricted')}
        </p>
      )}

      {data.reason ? (
        <p className="text-[11px] text-[var(--muted-foreground)]">{data.reason}</p>
      ) : null}
    </div>
  );
}

/** Mounted only after the first reveal → this is where the single request is issued. */
function DriverInfluenceLoader({
  organizationId,
  req,
}: {
  organizationId: string | null;
  req: EvaluationsAnalyticsRequest;
}) {
  const { t } = useLanguage();
  const state = useEvaluationsDriverInfluence(organizationId, req);
  if (state.phase === 'IDLE') {
    return <p className="text-sm text-[var(--muted-foreground)]">{t('evaluations.availability.idle')}</p>;
  }
  if (state.phase === 'LOADING') {
    return (
      <div
        className="h-16 rounded-xl bg-[var(--muted)] animate-pulse"
        role="status"
        aria-label={t('evaluations.availability.loading')}
      />
    );
  }
  if (state.result.state !== 'AVAILABLE') return <TransportMessage state={state.result.state} />;
  return <DriverContent data={state.result.data} />;
}

export function DriverInfluenceSection({
  organizationId,
  req,
}: {
  organizationId: string | null;
  req: EvaluationsAnalyticsRequest;
}) {
  const { t } = useLanguage();
  const [revealed, setRevealed] = useState(false);
  const [open, setOpen] = useState(false);

  const onToggle = () => {
    if (!revealed) {
      setRevealed(true);
      setOpen(true);
      return;
    }
    setOpen((o) => !o);
  };

  return (
    <section
      className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 flex flex-col gap-3"
      aria-labelledby="evaluations-driver-heading"
      data-testid="evaluations-driver"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 id="evaluations-driver-heading" className="text-sm font-semibold">
          {t('evaluations.section.driverInfluence')}
        </h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={revealed && open}
          aria-controls={DRIVER_PANEL_ID}
          data-testid="evaluations-driver-toggle"
          className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)]"
        >
          {!revealed
            ? t('evaluations.driver.reveal')
            : open
              ? t('evaluations.driver.hide')
              : t('evaluations.driver.show')}
        </button>
      </div>

      {/* Association-only introduction (neutral; shown before and after reveal). */}
      <p className="text-[11px] text-[var(--muted-foreground)]">{t('evaluations.driver.intro')}</p>

      <div id={DRIVER_PANEL_ID} hidden={!revealed || !open}>
        {revealed ? <DriverInfluenceLoader organizationId={organizationId} req={req} /> : null}
      </div>
    </section>
  );
}

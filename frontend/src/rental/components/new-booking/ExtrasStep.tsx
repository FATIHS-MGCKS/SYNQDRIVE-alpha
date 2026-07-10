import { SectionHeader } from '../../../components/patterns';
import {
  formatOptionGrossLabel,
  formatPriceCents,
  grossFromNetCents,
} from '../../pricing/pricingUtils';
import { Icon } from '../ui/Icon';
import { BookingStepCard } from './BookingStepCard';
import { formatBookingAmount } from './format';
import type { ExtrasStepProps } from './types';

export function ExtrasStep({
  hasResolvedPricing,
  mileagePackages,
  insuranceOptions,
  extraOptions,
  selectedMileagePackage,
  selectedInsurances,
  extras,
  taxRatePercent,
  displayRentalDays,
  hasPrice,
  extrasTotal,
  pricingCurrency,
  onSelectMileagePackage,
  onToggleInsurance,
  onToggleExtra,
}: ExtrasStepProps) {
  const ccy = pricingCurrency;
  const fmtCents = (cents: number) => (ccy ? formatPriceCents(cents, ccy) : '—');
  const hasSelection =
    Boolean(selectedMileagePackage) || selectedInsurances.length > 0 || extras.length > 0;

  return (
    <>
      <BookingStepCard>
        <div className="p-4">
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg sq-tone-success">
              <Icon name="fuel" className="h-5 w-5 text-[color:var(--status-positive)]" />
            </div>
            <SectionHeader title="Kilometerpakete" />
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Zusätzliche Kilometer für die Buchung. Es kann nur ein Paket gewählt werden.
          </p>
          {!hasResolvedPricing ? (
            <div className="py-6 text-center">
              <p className="text-xs text-[color:var(--status-watch)]">
                Tarif wird serverseitig für den gewählten Zeitraum aufgelöst. Bitte Zeitraum prüfen
                oder Price Tariffs-Zuweisung kontrollieren.
              </p>
            </div>
          ) : mileagePackages.length > 0 ? (
            <div className="grid grid-cols-3 gap-3">
              {mileagePackages.map((pkg) => {
                const isSelected = selectedMileagePackage === pkg.id;
                return (
                  <button
                    key={pkg.id}
                    type="button"
                    onClick={() => onSelectMileagePackage(isSelected ? null : pkg.id)}
                    className={`relative overflow-hidden rounded-lg border p-4 text-center transition-all ${
                      isSelected
                        ? 'sq-tone-success border border-border ring-1 ring-[color:var(--status-positive-soft)]'
                        : 'border-border bg-muted/40 hover:border-border'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute right-2 top-2">
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600">
                          <Icon name="check" className="h-3 w-3 text-white" />
                        </div>
                      </div>
                    )}
                    <p
                      className={`mb-1 text-xs ${
                        isSelected ? 'text-[color:var(--status-positive)]' : 'text-foreground'
                      }`}
                    >
                      +{pkg.includedKm.toLocaleString('de-DE')}
                    </p>
                    <p className="mb-2 text-xs text-muted-foreground">Kilometer</p>
                    <div
                      className={`text-xs ${
                        isSelected ? 'text-[color:var(--status-positive)]' : 'text-foreground'
                      }`}
                    >
                      {fmtCents(grossFromNetCents(pkg.priceCents, taxRatePercent))}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {fmtCents(
                        Math.round(
                          grossFromNetCents(pkg.priceCents, taxRatePercent) / Math.max(1, pkg.includedKm),
                        ),
                      )}
                      /km effektiv
                    </p>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="py-3 text-center text-xs text-muted-foreground">
              Keine Kilometerpakete für dieses Fahrzeug verfügbar.
            </p>
          )}
        </div>
      </BookingStepCard>

      <BookingStepCard>
        <div className="p-4">
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg sq-tone-ai">
              <Icon name="shield" className="h-5 w-5 text-[color:var(--status-ai)]" />
            </div>
            <SectionHeader title="Versicherungspakete" />
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Zusätzliche Versicherungsdeckung für den Mietzeitraum wählen.
          </p>
          {insuranceOptions.length > 0 ? (
            <div className="space-y-3">
              {insuranceOptions.map((ins) => {
                const isSelected = selectedInsurances.includes(ins.id);
                return (
                  <button
                    key={ins.id}
                    type="button"
                    onClick={() => onToggleInsurance(ins.id)}
                    className={`flex w-full items-center justify-between rounded-lg border p-4 text-left transition-all ${
                      isSelected
                        ? 'sq-tone-ai border border-border ring-1 ring-border'
                        : 'border-border bg-muted/40 hover:border-border'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                          isSelected ? 'border-purple-600 bg-purple-600' : 'border-border'
                        }`}
                      >
                        {isSelected && <Icon name="check" className="h-3 w-3 text-white" />}
                      </div>
                      <div>
                        <p className="text-xs text-foreground">{ins.label}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{ins.description}</p>
                      </div>
                    </div>
                    <div className="ml-4 shrink-0 text-right">
                      <p
                        className={`text-xs ${
                          isSelected ? 'text-[color:var(--status-ai)]' : 'text-foreground'
                        }`}
                      >
                        {ccy
                          ? formatOptionGrossLabel(
                              ins.priceCents,
                              ins.pricingType,
                              taxRatePercent,
                              ccy,
                              displayRentalDays,
                            )
                          : '—'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {ins.pricingType === 'PER_DAY' ? 'pro Tag' : 'pro Buchung'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="py-3 text-center text-xs text-muted-foreground">
              Keine Versicherungsoptionen für dieses Fahrzeug verfügbar.
            </p>
          )}
        </div>
      </BookingStepCard>

      <BookingStepCard>
        <div className="p-4">
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg sq-tone-info">
              <Icon name="star" className="h-5 w-5 text-[color:var(--status-info)]" />
            </div>
            <SectionHeader title="Extras" />
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Optionales Zubehör und Services zur Buchung hinzufügen.
          </p>
          {extraOptions.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {extraOptions.map((opt) => {
                const isSelected = extras.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onToggleExtra(opt.id)}
                    className={`flex items-center gap-3 rounded-lg border p-4 text-left transition-all ${
                      isSelected
                        ? 'sq-tone-brand border border-border ring-1 ring-[color:var(--brand-glow)]'
                        : 'border-border bg-muted/40 hover:border-border'
                    }`}
                  >
                    <span className="shrink-0 text-base">✦</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-foreground">{opt.label}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{opt.description}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`text-xs ${
                          isSelected ? 'text-[color:var(--status-info)]' : 'text-foreground'
                        }`}
                      >
                        {ccy
                          ? formatOptionGrossLabel(
                              opt.priceCents,
                              opt.pricingType,
                              taxRatePercent,
                              ccy,
                              displayRentalDays,
                            )
                          : '—'}
                      </span>
                      <div
                        className={`flex h-5 w-5 items-center justify-center rounded border-2 ${
                          isSelected ? 'border-brand bg-brand' : 'border-border'
                        }`}
                      >
                        {isSelected && <Icon name="check" className="h-3 w-3 text-white" />}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="py-3 text-center text-xs text-muted-foreground">
              Keine Extras für dieses Fahrzeug verfügbar.
            </p>
          )}
        </div>
      </BookingStepCard>

      {hasSelection && (
        <BookingStepCard>
          <div className="p-4">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {selectedMileagePackage && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs sq-chip-success">
                    <Icon name="fuel" className="h-3 w-3" /> 1 Kilometerpaket
                  </span>
                )}
                {selectedInsurances.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs sq-tone-ai">
                    <Icon name="shield" className="h-3 w-3" /> {selectedInsurances.length} Versicherung
                    {selectedInsurances.length !== 1 ? 'en' : ''}
                  </span>
                )}
                {extras.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs sq-chip-info">
                    <Icon name="star" className="h-3 w-3" /> {extras.length} Extra
                    {extras.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <span className="text-xs text-foreground">
                {hasPrice && ccy ? `+ ${formatBookingAmount(extrasTotal, ccy)}` : '—'}
              </span>
            </div>
          </div>
        </BookingStepCard>
      )}
    </>
  );
}

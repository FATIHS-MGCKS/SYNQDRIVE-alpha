import { BrandLogoMark, getBrandFromModel } from '../BrandLogo';
import { Icon } from '../ui/Icon';
import { stationLabel } from '../../lib/stationBookingUtils';
import { buildMMY } from '../../lib/vehicleMmy';
import { formatPriceCents } from '../../pricing/pricingUtils';
import { BookingStepCard } from './BookingStepCard';
import { formatEuroAmount } from './format';
import type { BookingSummaryPanelProps } from './types';

export function BookingSummaryPanel(props: BookingSummaryPanelProps) {
  const {
    selectedVehicle,
    selectedCustomer,
    pickupDate,
    returnDate,
    pickupTime,
    returnTime,
    rentalDays,
    displayRentalDays,
    pickupStationId,
    returnStationId,
    sameReturnStation,
    orgStations,
    selectedMileagePackage,
    selectedInsurances,
    extras,
    mileagePackages,
    insuranceOptions,
    extraOptions,
    noTariffForVehicle,
    canCalculatePrice,
    priceLoading,
    priceError,
    priceSim,
    totalFreeKm,
    extraKmPrice,
    mileagePkgKm,
    freeKmPerDay,
    baseFreeKm,
    subtotalNet,
    tax,
    taxRatePercent,
    grandTotal,
    depositAmount,
    isDarkMode,
  } = props;

  return (
    <BookingStepCard>
      <div className="p-4">
        <h3 className="mb-3 text-base text-muted-foreground">Buchungs- & Preisübersicht</h3>

        <div className="mb-3 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mb-1 text-[11px] text-muted-foreground">Fahrzeug</div>
              {selectedVehicle ? (
                <div className="flex items-center gap-2">
                  <BrandLogoMark
                    brand={getBrandFromModel({
                      make: selectedVehicle.make,
                      model: selectedVehicle.model,
                    })}
                    isDarkMode={isDarkMode}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-xs text-foreground">{buildMMY(selectedVehicle)}</p>
                    <p className="text-[11px] text-muted-foreground">{selectedVehicle.license}</p>
                  </div>
                </div>
              ) : (
                <p className="text-xs italic text-muted-foreground">–</p>
              )}
            </div>
            <div>
              <div className="mb-1 text-[11px] text-muted-foreground">Kunde</div>
              {selectedCustomer ? (
                <>
                  <p className="text-xs text-foreground">{selectedCustomer.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {selectedCustomer.type === 'Corporate' ? 'Firmenkunde' : 'Privatkunde'}
                  </p>
                </>
              ) : (
                <p className="text-xs italic text-muted-foreground">–</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mb-1 text-[11px] text-muted-foreground">Zeitraum</div>
              {pickupDate && returnDate ? (
                <>
                  <p className="text-xs text-foreground">
                    {new Date(pickupDate).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })} –{' '}
                    {new Date(returnDate).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {rentalDays} Tage · {pickupTime} – {returnTime}
                  </p>
                </>
              ) : (
                <p className="text-xs italic text-muted-foreground">–</p>
              )}
            </div>
            <div>
              <div className="mb-1 text-[11px] text-muted-foreground">Station</div>
              {pickupStationId ? (
                <>
                  <p className="flex items-center gap-1 text-xs text-foreground">
                    <Icon name="map-pin" className="h-3 w-3" />
                    {orgStations.find((s) => s.id === pickupStationId)
                      ? stationLabel(orgStations.find((s) => s.id === pickupStationId)!)
                      : '—'}
                  </p>
                  {!sameReturnStation && returnStationId && returnStationId !== pickupStationId && (
                    <p className="text-[11px] text-muted-foreground">
                      Rückgabe:{' '}
                      {orgStations.find((s) => s.id === returnStationId)
                        ? stationLabel(orgStations.find((s) => s.id === returnStationId)!)
                        : '—'}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs italic text-muted-foreground">–</p>
              )}
            </div>
          </div>
          {(selectedMileagePackage || selectedInsurances.length > 0 || extras.length > 0) && (
            <div>
              <div className="mb-1.5 text-[11px] text-muted-foreground">Extras & Packages</div>
              <div className="flex flex-wrap gap-1.5">
                {selectedMileagePackage && (() => {
                  const pkg = mileagePackages.find((p) => p.id === selectedMileagePackage);
                  return pkg ? (
                    <span className="rounded-full px-1.5 py-0.5 text-[11px] sq-chip-success">+{pkg.includedKm}km</span>
                  ) : null;
                })()}
                {selectedInsurances.map((insId) => {
                  const ins = insuranceOptions.find((i) => i.id === insId);
                  return (
                    <span key={insId} className="rounded-full px-1.5 py-0.5 text-[11px] sq-tone-ai">
                      {ins?.label}
                    </span>
                  );
                })}
                {extras.map((e) => {
                  const opt = extraOptions.find((o) => o.id === e);
                  return (
                    <span key={e} className="rounded-full px-1.5 py-0.5 text-[11px] sq-chip-info">
                      {opt?.label}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="mb-3 border-t border-border" />

        <div className="space-y-2.5">
          {noTariffForVehicle && (
            <p className="text-xs text-[color:var(--status-watch)]">
              Kein aktiver Tarif für dieses Fahrzeug. Zuweisung in Price Tariffs erforderlich.
            </p>
          )}
          {canCalculatePrice && priceLoading && (
            <p className="text-xs text-muted-foreground">Preis wird berechnet…</p>
          )}
          {priceError && <p className="text-xs text-[color:var(--status-critical)]">{priceError}</p>}
          {!canCalculatePrice && selectedVehicle && (!pickupDate || !returnDate) && (
            <p className="text-xs text-muted-foreground">Zeitraum wählen für Preisberechnung.</p>
          )}
          {priceSim?.lineItems.map((line) => (
            <div key={`${line.type}-${line.label}-${line.sortOrder ?? 0}`} className="flex justify-between text-xs">
              <span className="text-muted-foreground">{line.label}</span>
              <span className="text-foreground">{formatPriceCents(line.totalGrossCents)}</span>
            </div>
          ))}
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Frei-Kilometer</span>
            <span className="text-[color:var(--status-positive)]">{totalFreeKm.toLocaleString('de-DE')} km</span>
          </div>
          {extraKmPrice != null && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Extra-km</span>
              <span className="text-muted-foreground">{formatEuroAmount(extraKmPrice)}/km</span>
            </div>
          )}
          {mileagePkgKm > 0 && (
            <div className="space-y-1.5 border-l border-border pl-3">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">
                  Basis ({freeKmPerDay} km/Tag × {displayRentalDays})
                </span>
                <span className="text-muted-foreground">{baseFreeKm.toLocaleString('de-DE')} km</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[color:var(--status-positive)]">+ Kilometerpaket</span>
                <span className="text-[color:var(--status-positive)]">
                  +{mileagePkgKm.toLocaleString('de-DE')} km
                </span>
              </div>
            </div>
          )}
          {priceSim?.warnings?.map((w) => (
            <p key={w} className="text-[11px] text-[color:var(--status-watch)]">
              {w}
            </p>
          ))}
          <div className="mt-2 space-y-2 border-t border-border pt-3">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Zwischensumme (netto)</span>
              <span className="text-foreground">{formatEuroAmount(subtotalNet)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">MwSt. ({taxRatePercent}%)</span>
              <span className="text-foreground">{formatEuroAmount(tax)}</span>
            </div>
          </div>
          <div className="flex items-baseline justify-between border-t border-border pt-3">
            <span className="text-foreground">Gesamt</span>
            <span className="text-base text-foreground">{formatEuroAmount(grandTotal)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Kaution</span>
            <span className="text-[color:var(--status-watch)]">{formatEuroAmount(depositAmount)}</span>
          </div>
        </div>
      </div>
    </BookingStepCard>
  );
}

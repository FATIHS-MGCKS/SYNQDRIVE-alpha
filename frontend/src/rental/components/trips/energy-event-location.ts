import type { EnergyEvent } from '../../../lib/api';

type EnergyEventLocationFields = Pick<
  EnergyEvent,
  | 'locationDisplayName'
  | 'stationName'
  | 'locationName'
  | 'placeName'
  | 'addressLabel'
  | 'address'
>;

export function resolveEnergyEventLocationLabel(
  event: EnergyEventLocationFields,
  locale: string = 'de',
): string {
  const unknown = locale === 'de' ? 'Standort nicht erkannt' : 'Location unknown';

  return (
    event.locationDisplayName?.trim() ||
    event.stationName?.trim() ||
    event.locationName?.trim() ||
    event.placeName?.trim() ||
    event.addressLabel?.trim() ||
    event.address?.trim() ||
    unknown
  );
}

export function formatEnergyEventLocationForDisplay(
  event: EnergyEvent,
  locale: string = 'de',
): string {
  return resolveEnergyEventLocationLabel(event, locale);
}

export function shouldHideEnergyEventCoordinates(event: EnergyEvent): boolean {
  return Boolean(
    event.locationDisplayName ||
      event.stationName ||
      event.locationName ||
      event.placeName ||
      event.addressLabel ||
      event.address,
  );
}

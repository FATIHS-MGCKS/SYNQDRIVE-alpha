import type { TripDecisionSummary } from './trip-decision.types';

const DATA_BASIS_LABELS: Record<TripDecisionSummary['dataBasis'], string> = {
  BELASTBAR: 'Datenbasis belastbar',
  EINGESCHRAENKT: 'Datenqualität eingeschränkt',
  UNZUREICHEND: 'Daten unzureichend',
  NICHT_UNTERSTUETZT: 'Nicht unterstützt',
};

const RECOMMENDATION_LABELS: Record<TripDecisionSummary['recommendation']['level'], string> = {
  KEINE_MASSNAHME: 'Keine Maßnahme',
  BEOBACHTEN: 'Beobachten',
  KUNDENGESPRAECH: 'Kundengespräch',
  MANUELLE_MIETFREIGABE: 'Manuelle Mietfreigabe',
  FAHRZEUGPRUEFUNG: 'Fahrzeugprüfung empfohlen',
  TECHNISCHE_DATENPRUEFUNG: 'Technische Datenprüfung',
};

const VEHICLE_LOAD_LABELS: Record<string, string> = {
  SCHONEND: 'Schonend',
  NORMAL: 'Normal',
  ERHOHT: 'Erhöht',
  STARK_ERHOHT: 'Stark erhöht',
};

const CONDUCT_LABELS: Record<string, string> = {
  UNAUFFAELLIG: 'Unauffällig',
  DYNAMISCH: 'Dynamisch',
  AUFFAELLIG: 'Auffällig',
  STARK_AUFFAELLIG: 'Stark auffällig',
  NICHT_BEWERTBAR: 'Nicht bewertbar',
};

export function mapTripDecisionSummaryLabels(summary: TripDecisionSummary) {
  return {
    dataBasis: DATA_BASIS_LABELS[summary.dataBasis] ?? summary.dataBasis,
    recommendation:
      RECOMMENDATION_LABELS[summary.recommendation.level] ?? summary.recommendation.level,
    vehicleLoad: summary.vehicleLoad
      ? VEHICLE_LOAD_LABELS[summary.vehicleLoad.level] ?? summary.vehicleLoad.level
      : null,
    driverConduct: summary.driverConduct
      ? CONDUCT_LABELS[summary.driverConduct.level] ?? summary.driverConduct.level
      : null,
  };
}

export function mapApiTripDecisionSummary(raw: unknown): TripDecisionSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as TripDecisionSummary;
}

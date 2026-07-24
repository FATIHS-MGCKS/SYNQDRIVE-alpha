export const DATA_PROCESSING_SECTIONS = [
  'activities',
  'enforcement',
  'providers',
  'consents',
  'partners',
  'audit',
] as const;

export type DataProcessingSectionId = (typeof DATA_PROCESSING_SECTIONS)[number];

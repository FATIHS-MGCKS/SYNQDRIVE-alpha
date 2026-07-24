/** Canonical Auswertungen page section anchors (Prompt 30/54). */
export const EVALUATIONS_SECTION_IDS = {
  filters: 'auswertungen-filter',
  executive: 'auswertungen-executive',
  strengthsWeaknesses: 'auswertungen-staerken-schwaechen',
  risks: 'auswertungen-risiken',
  finance: 'auswertungen-finanzen',
  fleet: 'auswertungen-flotte',
  costsDowntime: 'auswertungen-kosten-ausfaelle',
  actions: 'auswertungen-massnahmen',
  dataQuality: 'auswertungen-datenqualitaet',
} as const;

export type EvaluationsSectionId =
  (typeof EVALUATIONS_SECTION_IDS)[keyof typeof EVALUATIONS_SECTION_IDS];

export const EVALUATIONS_SECTION_ORDER: EvaluationsSectionId[] = [
  EVALUATIONS_SECTION_IDS.filters,
  EVALUATIONS_SECTION_IDS.executive,
  EVALUATIONS_SECTION_IDS.strengthsWeaknesses,
  EVALUATIONS_SECTION_IDS.risks,
  EVALUATIONS_SECTION_IDS.finance,
  EVALUATIONS_SECTION_IDS.fleet,
  EVALUATIONS_SECTION_IDS.costsDowntime,
  EVALUATIONS_SECTION_IDS.actions,
  EVALUATIONS_SECTION_IDS.dataQuality,
];

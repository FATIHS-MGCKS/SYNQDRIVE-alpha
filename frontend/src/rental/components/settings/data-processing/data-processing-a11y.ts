import type { DataProcessingSectionId } from './data-processing.constants';

export const DP_SECTION_TAB_ID: Record<DataProcessingSectionId, string> = {
  activities: 'dp-section-tab-activities',
  enforcement: 'dp-section-tab-enforcement',
  providers: 'dp-section-tab-providers',
  consents: 'dp-section-tab-consents',
  partners: 'dp-section-tab-partners',
  audit: 'dp-section-tab-audit',
};

export const DP_SECTION_PANEL_ID: Record<DataProcessingSectionId, string> = {
  activities: 'dp-section-panel-activities',
  enforcement: 'dp-section-panel-enforcement',
  providers: 'dp-section-panel-providers',
  consents: 'dp-section-panel-consents',
  partners: 'dp-section-panel-partners',
  audit: 'dp-section-panel-audit',
};

export const DATA_PROCESSING_MAIN_ID = 'data-processing-main';

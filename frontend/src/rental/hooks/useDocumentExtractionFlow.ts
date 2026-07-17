import { useDocumentIntakeFlow } from './useDocumentIntakeFlow';
import type { UseDocumentExtractionFlowOptions } from './useDocumentExtractionFlow.types';

export type { UseDocumentExtractionFlowOptions };

/** Vehicle-scoped embedded intake flow (drawer, operator). */
export function useDocumentExtractionFlow(options: UseDocumentExtractionFlowOptions) {
  return useDocumentIntakeFlow({
    vehicleId: options.vehicleId,
    initialDocType: options.initialDocType,
    locale: options.locale,
    uploadSource: options.uploadSource,
    onComplete: options.onComplete,
    mode: 'embedded',
    pollThroughApply: false,
    respectAllowedActions: false,
  });
}

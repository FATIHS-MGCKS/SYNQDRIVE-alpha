import { useDocumentIntakeFlow } from './useDocumentIntakeFlow';
import type { UseDocumentExtractionFlowOptions } from './useDocumentExtractionFlow.types';

export type { UseDocumentExtractionFlowOptions };

/** Vehicle-scoped embedded intake flow (drawer, operator). */
export function useDocumentExtractionFlow(options: UseDocumentExtractionFlowOptions) {
  return useDocumentIntakeFlow({
    vehicleId: options.vehicleId,
    initialDocType: options.initialDocType ?? 'AUTO',
    locale: options.locale,
    uploadSource: options.uploadSource,
    sourceSurface: options.sourceSurface ?? 'vehicle_detail',
    onComplete: options.onComplete,
    mode: 'embedded',
    pollThroughApply: true,
    respectAllowedActions: false,
  });
}

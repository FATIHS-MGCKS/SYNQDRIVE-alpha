import { useDocumentIntakeFlow } from './useDocumentIntakeFlow';
import type { UseDocumentExtractionFlowOptions } from './useDocumentExtractionFlow.types';

export type { UseDocumentExtractionFlowOptions };

/** Vehicle-scoped or org-context embedded intake flow (drawer, operator). */
export function useDocumentExtractionFlow(options: UseDocumentExtractionFlowOptions) {
  return useDocumentIntakeFlow({
    vehicleId: options.vehicleId ?? '',
    orgId: options.orgId ?? null,
    initialDocType: options.initialDocType ?? 'AUTO',
    locale: options.locale,
    uploadSource: options.uploadSource,
    optionalContextType: options.optionalContextType,
    optionalContextId: options.optionalContextId,
    sourceSurface: options.sourceSurface ?? 'vehicle_detail',
    onComplete: options.onComplete,
    mode: 'embedded',
    pollThroughApply: true,
    respectAllowedActions: false,
  });
}

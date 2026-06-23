import type { OperatorSheetAction } from '../lib/operatorTypes';
import { OperatorAiUploadFlow } from '../ai-upload/OperatorAiUploadFlow';

interface OperatorAiUploadSheetProps {
  action: Extract<OperatorSheetAction, { type: 'ai-upload' }>;
}

/** Mobile/tablet AI Upload — reuses canonical `useDocumentExtractionFlow` pipeline. */
export function OperatorAiUploadSheet({ action }: OperatorAiUploadSheetProps) {
  return <OperatorAiUploadFlow action={action} />;
}

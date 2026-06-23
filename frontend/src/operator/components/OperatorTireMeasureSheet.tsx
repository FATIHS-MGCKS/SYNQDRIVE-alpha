import type { OperatorSheetAction } from '../lib/operatorTypes';
import { OperatorTireMeasureFlow } from '../tire-measure/OperatorTireMeasureFlow';

interface OperatorTireMeasureSheetProps {
  action: Extract<OperatorSheetAction, { type: 'tire-measure' }>;
}

/** Sheet entry — delegates to the 5-step measurement flow. */
export function OperatorTireMeasureSheet({ action }: OperatorTireMeasureSheetProps) {
  return <OperatorTireMeasureFlow action={action} />;
}

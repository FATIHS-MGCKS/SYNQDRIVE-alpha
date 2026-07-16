import type { DrivingIntelligenceJob } from '@prisma/client';
import type { MisuseReconcileTrigger } from './misuse-case-reconcile.types';

export function inferMisuseReconcileTrigger(job: DrivingIntelligenceJob): MisuseReconcileTrigger {
  const correlation = job.correlationId ?? '';
  if (correlation.startsWith('reconcile:')) return 'PERIODIC_STUCK_TRIP';
  if (correlation.includes('attribution')) return 'ATTRIBUTION';
  if (correlation.includes('impact')) return 'DRIVING_IMPACT';
  if (correlation.includes('model-version') || correlation.includes('supersede')) {
    return 'MODEL_VERSION_CHANGE';
  }
  if (correlation.includes('event-context') || correlation.includes('context')) {
    return 'EVENT_CONTEXT';
  }
  return 'EVENT_CONTEXT';
}

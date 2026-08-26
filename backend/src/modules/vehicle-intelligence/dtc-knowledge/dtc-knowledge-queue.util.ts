import { sanitizeBullMqJobId } from '@shared/queue/bullmq-job-id.sanitizer';

export const DTC_KNOWLEDGE_JOB_NAMESPACE = 'dtc-knowledge';

export function buildDtcKnowledgeGenericJobId(normalizedCode: string, language: string): string {
  return sanitizeBullMqJobId({
    namespace: DTC_KNOWLEDGE_JOB_NAMESPACE,
    key: `generic:${normalizedCode}:${language}`,
  });
}

export function buildDtcKnowledgeVehicleJobId(params: {
  normalizedCode: string;
  make: string | null;
  model: string | null;
  year: number | null;
  fuelType: string | null;
  language: string;
}): string {
  const { normalizedCode, make, model, year, fuelType, language } = params;
  return sanitizeBullMqJobId({
    namespace: DTC_KNOWLEDGE_JOB_NAMESPACE,
    key: `vehicle:${normalizedCode}:${make ?? ''}:${model ?? ''}:${year ?? ''}:${fuelType ?? ''}:${language}`,
  });
}

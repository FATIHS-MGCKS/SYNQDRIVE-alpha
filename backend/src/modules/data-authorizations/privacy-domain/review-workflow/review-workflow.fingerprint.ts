import { createHash } from 'crypto';

export interface ProcessingActivityFingerprintInput {
  activityCode: string;
  title: string;
  description?: string | null;
  categories: string[];
  purposes: string[];
}

export function computeProcessingActivityFingerprint(
  input: ProcessingActivityFingerprintInput,
): string {
  const payload = JSON.stringify({
    activityCode: input.activityCode.trim(),
    title: input.title.trim(),
    description: (input.description ?? '').trim(),
    categories: [...input.categories].sort(),
    purposes: [...input.purposes].sort(),
  });
  return createHash('sha256').update(payload).digest('hex');
}

export function isMaterialFingerprintChange(
  previous: string | null | undefined,
  next: string,
): boolean {
  if (!previous) return false;
  return previous !== next;
}

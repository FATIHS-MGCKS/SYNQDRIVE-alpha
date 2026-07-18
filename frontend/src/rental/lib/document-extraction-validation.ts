import type { DocumentExtractionMetadata } from './document-extraction.types';

export type UploadValidationCode =
  | 'NO_VEHICLE'
  | 'NO_FILE'
  | 'MULTIPLE_FILES'
  | 'EMPTY_FILE'
  | 'FILE_TOO_LARGE'
  | 'INVALID_EXTENSION'
  | 'INVALID_MIME';

export interface UploadValidationResult {
  ok: boolean;
  code?: UploadValidationCode;
}

function fileExtension(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx < 0) return '';
  return name.slice(idx).toLowerCase();
}

export function validateUploadFile(
  file: File | null | undefined,
  metadata: Pick<DocumentExtractionMetadata, 'extensions' | 'mimeTypes' | 'maxUploadBytes'> | null,
  opts?: {
    vehicleSelected?: boolean;
    requireVehicle?: boolean;
    allowMultiple?: boolean;
    fileCount?: number;
  },
): UploadValidationResult {
  const requireVehicle = opts?.requireVehicle ?? true;
  if (requireVehicle && !opts?.vehicleSelected) return { ok: false, code: 'NO_VEHICLE' };
  if (!file) return { ok: false, code: 'NO_FILE' };
  if ((opts?.fileCount ?? 1) > 1 && !opts?.allowMultiple) return { ok: false, code: 'MULTIPLE_FILES' };
  if (file.size === 0) return { ok: false, code: 'EMPTY_FILE' };

  const maxBytes = metadata?.maxUploadBytes ?? 10 * 1024 * 1024;
  if (file.size > maxBytes) return { ok: false, code: 'FILE_TOO_LARGE' };

  const ext = fileExtension(file.name);
  const allowedExt = metadata?.extensions?.map((e) => e.toLowerCase()) ?? ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.txt'];
  if (!allowedExt.includes(ext)) return { ok: false, code: 'INVALID_EXTENSION' };

  const allowedMime = metadata?.mimeTypes ?? ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'text/plain'];
  if (file.type && !allowedMime.includes(file.type)) return { ok: false, code: 'INVALID_MIME' };

  return { ok: true };
}

export function buildAcceptAttribute(extensions: string[] | undefined): string {
  return (extensions?.length ? extensions : ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.txt']).join(',');
}

export function buildSupportedFormatsLabel(
  extensions: string[],
  maxUploadMb: number,
): string {
  const extLabel = extensions
    .map((e) => e.replace(/^\./, '').toUpperCase())
    .join(', ');
  return `${extLabel} · max ${maxUploadMb} MB`;
}

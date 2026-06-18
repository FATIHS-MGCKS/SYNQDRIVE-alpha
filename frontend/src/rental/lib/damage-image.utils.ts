export const MAX_DAMAGE_IMAGE_BYTES = 6 * 1024 * 1024;
export const ALLOWED_DAMAGE_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export function validateDamageImageFile(file: File): string | null {
  if (!ALLOWED_DAMAGE_IMAGE_MIME.has(file.type)) {
    return 'Unsupported format. Use JPG, PNG, WebP, or GIF.';
  }
  if (file.size > MAX_DAMAGE_IMAGE_BYTES) {
    return `File too large (max ${(MAX_DAMAGE_IMAGE_BYTES / 1024 / 1024).toFixed(0)} MB). Compress before upload.`;
  }
  return null;
}

export function readFileAsDataUrl(file: File): Promise<string> {
  const validationError = validateDamageImageFile(file);
  if (validationError) {
    return Promise.reject(new Error(validationError));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });
}

export function formatApiError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'An unexpected error occurred.';
}

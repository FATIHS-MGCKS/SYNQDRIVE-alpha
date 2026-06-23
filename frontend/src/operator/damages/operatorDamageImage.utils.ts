import {
  readFileAsDataUrl,
  validateDamageImageFile,
} from '../../rental/lib/damage-image.utils';

const MAX_EDGE_PX = 1280;
const COMPRESS_ABOVE_BYTES = 512 * 1024;
const INITIAL_QUALITY = 0.72;
const MIN_QUALITY = 0.46;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Bild konnte nicht geladen werden.'));
    };
    img.src = url;
  });
}

function canvasToDataUrl(canvas: HTMLCanvasElement, mime: string, quality: number): string {
  return canvas.toDataURL(mime, quality);
}

async function compressImageFile(file: File): Promise<string> {
  const img = await loadImage(file);
  const sourceW = img.naturalWidth || img.width;
  const sourceH = img.naturalHeight || img.height;
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(sourceW, sourceH));
  const w = Math.max(1, Math.round(sourceW * scale));
  const h = Math.max(1, Math.round(sourceH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas nicht verfügbar.');
  ctx.drawImage(img, 0, 0, w, h);

  const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  let quality = INITIAL_QUALITY;
  let dataUrl = canvasToDataUrl(canvas, mime, quality);
  while (quality > MIN_QUALITY && dataUrl.length > 1_400_000) {
    quality -= 0.08;
    dataUrl = canvasToDataUrl(canvas, mime, quality);
  }
  return dataUrl;
}

/** Validates, optionally compresses large photos, returns data URL for damage APIs. */
export async function prepareDamageImageDataUrl(file: File): Promise<string> {
  const validationError = validateDamageImageFile(file);
  if (validationError) throw new Error(validationError);

  if (file.size <= COMPRESS_ABOVE_BYTES) {
    return readFileAsDataUrl(file);
  }

  try {
    return await compressImageFile(file);
  } catch {
    return readFileAsDataUrl(file);
  }
}

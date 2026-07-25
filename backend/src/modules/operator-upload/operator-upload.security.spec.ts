import { stripJpegSensitiveMetadata, validateAndHardenOperatorUpload } from './operator-upload.security';

// Minimal 1x1 PNG
const validPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('operator-upload.security', () => {
  it('rejects MIME/content mismatch', async () => {
    const result = await validateAndHardenOperatorUpload({
      buffer: validPng,
      mimeType: 'image/jpeg',
      fileName: 'photo.jpg',
      kind: 'DAMAGE_IMAGE',
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('does not match');
  });

  it('rejects disallowed extensions', async () => {
    const result = await validateAndHardenOperatorUpload({
      buffer: validPng,
      mimeType: 'image/png',
      fileName: 'photo.exe',
      kind: 'DAMAGE_IMAGE',
    });
    expect(result.ok).toBe(false);
  });

  it('accepts valid PNG uploads', async () => {
    const result = await validateAndHardenOperatorUpload({
      buffer: validPng,
      mimeType: 'image/png',
      fileName: 'photo.png',
      kind: 'DAMAGE_IMAGE',
    });
    expect(result.ok).toBe(true);
    expect(result.detectedMime).toBe('image/png');
  });

  it('strips JPEG APP1 EXIF segments', () => {
    const jpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      Buffer.from([0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00]),
      Buffer.from([0xff, 0xd9]),
    ]);
    const stripped = stripJpegSensitiveMetadata(jpeg);
    expect(stripped.includes(Buffer.from('Exif'))).toBe(false);
    expect(stripped[0]).toBe(0xff);
    expect(stripped[1]).toBe(0xd8);
  });
});

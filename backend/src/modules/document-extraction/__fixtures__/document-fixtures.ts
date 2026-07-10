/** Deterministic binary fixtures for document extraction tests. */

export const FIXTURE_TXT = Buffer.from('Rechnung Nr. 42\nKm-Stand: 50000', 'utf8');

/** Minimal JPEG signature recognized by file-type. */
export const FIXTURE_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00,
  0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);

/** Minimal PNG header recognized by file-type. */
export const FIXTURE_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89,
]);

/** Minimal WebP RIFF container recognized by file-type. */
export const FIXTURE_WEBP = Buffer.from('RIFF\x24\x00\x00\x00WEBPVP8 \x18\x00\x00\x00', 'ascii');

/** Valid PDF header without a usable text layer. */
export const FIXTURE_SCANNED_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n',
  'ascii',
);

export const FIXTURE_CORRUPT_PDF = Buffer.from('%PDF-1.4 this is not a valid pdf structure', 'ascii');

export const FIXTURE_CORRUPT_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]);

export const FIXTURE_DIGITAL_PDF_TEXT =
  'Service report vehicle VIN WBA12345 odometer 50000 workshop ACME invoice 100 EUR';

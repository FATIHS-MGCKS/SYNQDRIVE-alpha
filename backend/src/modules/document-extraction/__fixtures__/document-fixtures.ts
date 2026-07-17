function buildExifOrientationSegment(orientation: number): Buffer {
  const tiff = Buffer.alloc(24);
  tiff.writeUInt16LE(0x4949, 0);
  tiff.writeUInt16LE(0x002a, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x0112, 10);
  tiff.writeUInt16LE(3, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt16LE(orientation, 18);

  const payload = Buffer.concat([Buffer.from('Exif\x00\x00', 'ascii'), tiff]);
  const segment = Buffer.alloc(4 + payload.length);
  segment[0] = 0xff;
  segment[1] = 0xe1;
  segment.writeUInt16BE(payload.length + 2, 2);
  payload.copy(segment, 4);
  return segment;
}

/** Deterministic binary fixtures for document extraction tests. */

export const FIXTURE_TXT = Buffer.from('Rechnung Nr. 42\nKm-Stand: 50000', 'utf8');

function buildMinimalJpeg(width = 1, height = 1, extraSegments: Buffer[] = []): Buffer {
  const jfif = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00,
    0x01, 0x00, 0x01, 0x00, 0x00,
  ]);
  const sof = Buffer.alloc(11);
  sof[0] = 0xff;
  sof[1] = 0xc0;
  sof.writeUInt16BE(9, 2);
  sof[4] = 8;
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  sof[9] = 0x01;
  sof[10] = 0x11;
  const eoi = Buffer.from([0xff, 0xd9]);
  return Buffer.concat([jfif, ...extraSegments, sof, eoi]);
}

/** Minimal JPEG with readable dimensions (1x1). */
export const FIXTURE_JPEG = buildMinimalJpeg(1, 1);

/** JPEG with EXIF orientation tag 6 (90° clockwise). */
export const FIXTURE_JPEG_ROTATED = buildMinimalJpeg(2, 3, [buildExifOrientationSegment(6)]);

/** Minimal PNG header recognized by file-type. */
export const FIXTURE_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89,
]);

/** Minimal WebP RIFF container recognized by file-type. */
export const FIXTURE_WEBP = (() => {
  const buf = Buffer.alloc(32);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(24, 4);
  buf.write('WEBPVP8 ', 8, 'ascii');
  buf.writeUInt32LE(16, 12);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(1, 28);
  return buf;
})();

/** Valid PDF header without streams (digital-style minimal shell). */
export const FIXTURE_SCANNED_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Page/Parent 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[1 0 R]/Count 1>>endobj\ntrailer<</Root 2 0 R>>\n%%EOF\n',
  'ascii',
);

/** Multi-page PDF with explicit /Count. */
export const FIXTURE_MULTI_PAGE_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Page/Parent 2 0 R>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R>>endobj\n4 0 obj<</Type/Page/Parent 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[1 0 R 3 0 R 4 0 R]/Count 3>>endobj\ntrailer<</Root 2 0 R>>\n%%EOF\n',
  'ascii',
);

/** PDF with /Encrypt dictionary marker (no decryption attempted). */
export const FIXTURE_PASSWORD_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Page/Parent 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[1 0 R]/Count 1>>endobj\n3 0 obj<</Filter/Standard/Length 0>>endobj\ntrailer<</Root 2 0 R/Encrypt 3 0 R>>\n%%EOF\n',
  'ascii',
);

/** PDF with inflated /Length markers to trip decompressed-byte guard in tests. */
export function buildComplexPdfFixture(lengthValue: number): Buffer {
  const body = `1 0 obj<</Length ${lengthValue}>>stream\nx\nendstream endobj\ntrailer<<>>\n%%EOF\n`;
  return Buffer.from(`%PDF-1.4\n${body}`, 'ascii');
}

export const FIXTURE_CORRUPT_PDF = Buffer.from('%PDF-1.4 this is not a valid pdf structure', 'ascii');

export const FIXTURE_CORRUPT_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]);

export const FIXTURE_DIGITAL_PDF_TEXT =
  'Service report vehicle VIN WBA12345 odometer 50000 workshop ACME invoice 100 EUR';

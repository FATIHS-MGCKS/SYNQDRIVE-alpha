import { probePdfBuffer } from './document-pdf-probe.util';
import { probeJpegBuffer } from './document-image-probe.util';
import {
  FIXTURE_CORRUPT_PDF,
  FIXTURE_JPEG_ROTATED,
  FIXTURE_MULTI_PAGE_PDF,
  FIXTURE_PASSWORD_PDF,
  buildComplexPdfFixture,
} from './__fixtures__/document-fixtures';

describe('document identification security probes', () => {
  it('detects password markers without decrypting PDF bytes', () => {
    const probe = probePdfBuffer(FIXTURE_PASSWORD_PDF);
    expect(probe.passwordProtected).toBe(true);
    expect(probe.corrupt).toBe(false);
  });

  it('does not treat unencrypted PDFs as password protected', () => {
    const probe = probePdfBuffer(FIXTURE_MULTI_PAGE_PDF);
    expect(probe.passwordProtected).toBe(false);
    expect(probe.pageCount).toBe(3);
  });

  it('flags corrupt PDF structure', () => {
    const probe = probePdfBuffer(FIXTURE_CORRUPT_PDF);
    expect(probe.corrupt).toBe(true);
  });

  it('estimates decompressed complexity for stream length bombs', () => {
    const probe = probePdfBuffer(buildComplexPdfFixture(50_000_000));
    expect(probe.estimatedDecompressedBytes).toBeGreaterThan(1_000_000);
  });

  it('reads EXIF orientation for OCR rotation hints', () => {
    const probe = probeJpegBuffer(FIXTURE_JPEG_ROTATED);
    expect(probe.corrupt).toBe(false);
    expect(probe.rotationDegrees).toBe(90);
  });
});

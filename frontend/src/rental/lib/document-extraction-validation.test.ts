import { describe, expect, it } from 'vitest';
import { validateUploadFile, buildAcceptAttribute, buildSupportedFormatsLabel } from './document-extraction-validation';

const metadata = {
  extensions: ['.pdf', '.jpg', '.png'],
  mimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
  maxUploadBytes: 1024,
};

function file(name: string, type: string, size = 100): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe('document-extraction validation', () => {
  it('requires vehicle selection', () => {
    expect(validateUploadFile(file('a.pdf', 'application/pdf'), metadata, { vehicleSelected: false }).code).toBe('NO_VEHICLE');
  });

  it('rejects empty files', () => {
    expect(validateUploadFile(file('a.pdf', 'application/pdf', 0), metadata, { vehicleSelected: true }).code).toBe('EMPTY_FILE');
  });

  it('rejects oversize files', () => {
    expect(validateUploadFile(file('a.pdf', 'application/pdf', 2048), metadata, { vehicleSelected: true }).code).toBe('FILE_TOO_LARGE');
  });

  it('rejects invalid extension and MIME spoofing', () => {
    expect(validateUploadFile(file('a.exe', 'application/pdf'), metadata, { vehicleSelected: true }).code).toBe('INVALID_EXTENSION');
    expect(validateUploadFile(file('a.pdf', 'application/x-msdownload'), metadata, { vehicleSelected: true }).code).toBe('INVALID_MIME');
  });

  it('accepts valid PDF upload', () => {
    expect(validateUploadFile(file('invoice.pdf', 'application/pdf'), metadata, { vehicleSelected: true }).ok).toBe(true);
  });

  it('builds accept attribute and supported formats label', () => {
    expect(buildAcceptAttribute(['.pdf', '.png'])).toBe('.pdf,.png');
    expect(buildSupportedFormatsLabel(['.pdf', '.png'], 10)).toContain('PDF');
    expect(buildSupportedFormatsLabel(['.pdf', '.png'], 10)).toContain('10 MB');
  });
});

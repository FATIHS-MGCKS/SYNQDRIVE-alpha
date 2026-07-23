import type { DocumentPdfProbeResult } from '@modules/document-extraction/document-file-identification-status.types';
import { probePdfBuffer } from '@modules/document-extraction/document-pdf-probe.util';

export interface LegalDocumentPdfSecurityProbeResult extends DocumentPdfProbeResult {
  hasEmbeddedFiles: boolean;
  hasJavaScript: boolean;
  hasLaunchActions: boolean;
  activeContentReasons: string[];
}

const EMBEDDED_FILE_PATTERNS = [
  /\/EmbeddedFile\b/,
  /\/Filespec\b/,
  /\/EF\b/,
  /\/Collection\b/,
];

const JAVASCRIPT_PATTERNS = [/\/JavaScript\b/, /\/JS\b/, /\/S\s*\/JavaScript/];

const LAUNCH_ACTION_PATTERNS = [
  /\/Launch\b/,
  /\/OpenAction\b/,
  /\/AA\b/,
  /\/SubmitForm\b/,
  /\/ImportData\b/,
  /\/RichMedia\b/,
  /\/Movie\b/,
  /\/Sound\b/,
  /\/GoToR\b/,
  /\/GoToE\b/,
];

const MAX_SECURITY_PROBE_BYTES = 8 * 1024 * 1024;

export function probeLegalPdfSecurity(buffer: Buffer): LegalDocumentPdfSecurityProbeResult {
  const structural = probePdfBuffer(buffer);
  const sample = buffer.subarray(0, Math.min(buffer.length, MAX_SECURITY_PROBE_BYTES));
  const ascii = sample.toString('latin1');

  const activeContentReasons: string[] = [];
  const hasEmbeddedFiles = EMBEDDED_FILE_PATTERNS.some((pattern) => pattern.test(ascii));
  const hasJavaScript = JAVASCRIPT_PATTERNS.some((pattern) => pattern.test(ascii));
  const hasLaunchActions = LAUNCH_ACTION_PATTERNS.some((pattern) => pattern.test(ascii));

  if (hasEmbeddedFiles) activeContentReasons.push('embedded_files');
  if (hasJavaScript) activeContentReasons.push('javascript');
  if (hasLaunchActions) activeContentReasons.push('launch_actions');

  return {
    ...structural,
    hasEmbeddedFiles,
    hasJavaScript,
    hasLaunchActions,
    activeContentReasons,
  };
}

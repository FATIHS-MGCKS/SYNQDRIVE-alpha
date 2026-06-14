/**
 * Typed, user-safe errors for the extraction pipeline. Their messages are safe
 * to surface to the UI (they never contain document contents or secrets).
 */

/** Thrown when a file type has no configured text/vision extractor yet. */
export class OcrNotConfiguredError extends Error {
  readonly code = 'OCR_NOT_CONFIGURED';
  constructor(message = 'Image OCR is not configured yet') {
    super(message);
    this.name = 'OcrNotConfiguredError';
  }
}

/** Thrown when the uploaded file type is not supported at all. */
export class UnsupportedFileTypeError extends Error {
  readonly code = 'UNSUPPORTED_FILE_TYPE';
  constructor(message = 'Unsupported file type') {
    super(message);
    this.name = 'UnsupportedFileTypeError';
  }
}

/** Thrown when the AI extraction layer (DIMO Agents) is unavailable/disabled. */
export class AgentUnavailableError extends Error {
  readonly code = 'AGENT_UNAVAILABLE';
  constructor(message = 'AI extraction agent is not available') {
    super(message);
    this.name = 'AgentUnavailableError';
  }
}

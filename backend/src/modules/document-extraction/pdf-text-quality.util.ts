export interface PdfTextQualityThresholds {
  minTextChars: number;
  minSensibleCharRatio: number;
  maxRepeatedLineRatio: number;
}

export interface PdfTextQualityResult {
  usable: boolean;
  charCount: number;
  sensibleCharRatio: number;
}

const SENSIBLE_CHAR_PATTERN = /[\p{L}\p{N}\.,;:\-\/()%€$'"!?@#&+]/u;

/**
 * Heuristic quality gate for locally extracted PDF text layers.
 * Rejects whitespace-only, control-character noise, and repetitive OCR-like artifacts.
 */
export function evaluatePdfTextQuality(
  text: string,
  thresholds: PdfTextQualityThresholds,
): PdfTextQualityResult {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  const charCount = normalized.length;

  if (charCount < thresholds.minTextChars) {
    return { usable: false, charCount, sensibleCharRatio: 0 };
  }

  const withoutWhitespace = normalized.replace(/\s+/g, '');
  if (withoutWhitespace.length < thresholds.minTextChars) {
    return { usable: false, charCount, sensibleCharRatio: 0 };
  }

  const sensibleMatches = withoutWhitespace.match(new RegExp(SENSIBLE_CHAR_PATTERN, 'gu')) ?? [];
  const sensibleCharRatio = sensibleMatches.length / Math.max(withoutWhitespace.length, 1);

  if (sensibleCharRatio < thresholds.minSensibleCharRatio) {
    return { usable: false, charCount, sensibleCharRatio };
  }

  const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length >= 3) {
    const counts = new Map<string, number>();
    for (const line of lines) {
      counts.set(line, (counts.get(line) ?? 0) + 1);
    }
    const maxRepeat = Math.max(...counts.values());
    const repeatedLineRatio = maxRepeat / lines.length;
    if (repeatedLineRatio > thresholds.maxRepeatedLineRatio) {
      return { usable: false, charCount, sensibleCharRatio };
    }
  }

  return { usable: true, charCount, sensibleCharRatio };
}

export function parseLicenseIssuedAtFromExtractedJson(
  extractedJson: unknown,
): Date | null {
  if (!extractedJson || typeof extractedJson !== 'object') return null;
  const record = extractedJson as Record<string, unknown>;
  const candidates = [
    record.licenseIssuedAt,
    record.issueDate,
    record.issue_date,
    record.issuedAt,
    record.issuedOn,
    record.dateOfIssue,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' || value instanceof Date) {
      const parsed = value instanceof Date ? value : new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }
  return null;
}

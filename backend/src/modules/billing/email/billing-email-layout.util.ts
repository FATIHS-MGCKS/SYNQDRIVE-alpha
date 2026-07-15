export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeUrlForHref(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function renderBillingEmailLayout(input: {
  preheader: string;
  bodyHtml: string;
  brandName?: string;
}): string {
  const brand = escapeHtml(input.brandName ?? 'SynqDrive');
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.preheader)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader)}</span>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr>
            <td style="padding:20px 24px;background:#111827;color:#ffffff;font-size:18px;font-weight:700;">${brand}</td>
          </tr>
          <tr>
            <td style="padding:24px;font-size:15px;line-height:1.6;">${input.bodyHtml}</td>
          </tr>
          <tr>
            <td style="padding:16px 24px 24px;color:#6b7280;font-size:12px;line-height:1.5;border-top:1px solid #e5e7eb;">
              ${brand} · Abrechnungsbenachrichtigung
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderBillingCtaButton(label: string, href: string): string {
  const safeHref = sanitizeUrlForHref(href);
  if (!safeHref) return '';
  return `<p style="margin:24px 0;text-align:center;">
  <a href="${escapeHtml(safeHref)}" style="display:inline-block;padding:12px 24px;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">${escapeHtml(label)}</a>
</p>`;
}

export function renderBillingDetailsTable(
  rows: Array<{ label: string; value: string | null | undefined }>,
): string {
  const visible = rows.filter((row) => row.value?.trim());
  if (!visible.length) return '';
  const body = visible
    .map(
      (row) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top;">${escapeHtml(row.label)}</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(row.value!)}</td></tr>`,
    )
    .join('');
  return `<table role="presentation" style="margin:16px 0;border-collapse:collapse;width:100%;max-width:100%;">${body}</table>`;
}

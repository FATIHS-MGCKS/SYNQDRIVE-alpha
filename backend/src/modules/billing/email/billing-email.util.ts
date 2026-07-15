import { ConfigService } from '@nestjs/config';
import { BillingEmailLocale } from './billing-email-i18n';

export function formatBillingMoney(cents: number | null | undefined, currency: string, locale: BillingEmailLocale): string | null {
  if (cents == null) return null;
  const code = currency.trim().toUpperCase();
  const intlLocale = locale === 'en' ? 'en-GB' : 'de-DE';
  try {
    return new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency: code,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${code}`;
  }
}

export function formatBillingDate(
  value: Date | string | number | null | undefined,
  locale: BillingEmailLocale,
): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const intlLocale = locale === 'en' ? 'en-GB' : 'de-DE';
  return new Intl.DateTimeFormat(intlLocale, { dateStyle: 'medium' }).format(date);
}

export function resolveBillingRecipientEmail(org: {
  invoiceEmail?: string | null;
  email?: string | null;
  managerEmail?: string | null;
}): string | null {
  const candidate = org.invoiceEmail?.trim() || org.email?.trim() || org.managerEmail?.trim() || '';
  return candidate || null;
}

export function resolveBillingSettingsUrl(config: ConfigService): string {
  const base =
    config.get<string>('stripe.appUrl')?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.FRONTEND_URL?.trim() ||
    'http://localhost:5173';
  const path = config.get<string>('billingEmail.settingsPath', '/rental/settings?settingsTab=billing');
  const normalizedBase = base.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

const ALLOWED_PDF_HOST_SUFFIXES = ['.stripe.com', '.stripe.network'];

export function isAllowedBillingPdfUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return ALLOWED_PDF_HOST_SUFFIXES.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix));
  } catch {
    return false;
  }
}

export async function fetchBillingPdfAttachment(input: {
  url: string;
  maxBytes: number;
  timeoutMs: number;
  fileName: string;
}): Promise<{ fileName: string; mimeType: string; content: Buffer } | null> {
  if (!isAllowedBillingPdfUrl(input.url)) {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const response = await fetch(input.url, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/pdf' },
    });
    if (!response.ok) return null;
    const lengthHeader = response.headers.get('content-length');
    if (lengthHeader && Number(lengthHeader) > input.maxBytes) return null;
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > input.maxBytes) return null;
    const contentType = response.headers.get('content-type') ?? 'application/pdf';
    if (!contentType.includes('pdf') && !input.url.toLowerCase().includes('.pdf')) {
      return null;
    }
    return {
      fileName: input.fileName,
      mimeType: 'application/pdf',
      content: Buffer.from(arrayBuffer),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function resolveBillingPlanLabel(input: {
  priceBookName?: string | null;
  productKey?: string | null;
}): string | null {
  return input.priceBookName?.trim() || input.productKey?.trim() || null;
}

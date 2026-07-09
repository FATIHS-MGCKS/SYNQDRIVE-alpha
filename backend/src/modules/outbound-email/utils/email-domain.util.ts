/**
 * Normalize and validate a domain name (no protocol, no path).
 */
export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
}

/** Returns true when email's domain part matches the configured domain (incl. subdomains). */
export function emailBelongsToDomain(email: string, domain: string): boolean {
  const normalizedDomain = normalizeDomain(domain);
  const at = email.trim().toLowerCase().lastIndexOf('@');
  if (at < 0) return false;
  const emailDomain = email.slice(at + 1).toLowerCase();
  return emailDomain === normalizedDomain || emailDomain.endsWith(`.${normalizedDomain}`);
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export interface DnsRecordHint {
  type: 'TXT' | 'CNAME' | 'MX';
  host: string;
  value: string;
  purpose: 'SPF' | 'DKIM' | 'DMARC' | 'RETURN_PATH';
  status: 'pending' | 'verified';
}

export function buildDevDnsRecords(domain: string, dkimSelector = 'synqdrive'): DnsRecordHint[] {
  const normalized = normalizeDomain(domain);
  return [
    {
      type: 'TXT',
      host: normalized,
      value: `v=spf1 include:_spf.synqdrive.eu ~all`,
      purpose: 'SPF',
      status: 'pending',
    },
    {
      type: 'CNAME',
      host: `${dkimSelector}._domainkey.${normalized}`,
      value: `${dkimSelector}._domainkey.synqdrive.eu`,
      purpose: 'DKIM',
      status: 'pending',
    },
    {
      type: 'TXT',
      host: `_dmarc.${normalized}`,
      value: `v=DMARC1; p=none; rua=mailto:dmarc@${normalized}`,
      purpose: 'DMARC',
      status: 'pending',
    },
    {
      type: 'CNAME',
      host: `bounce.${normalized}`,
      value: 'bounce.synqdrive.eu',
      purpose: 'RETURN_PATH',
      status: 'pending',
    },
  ];
}

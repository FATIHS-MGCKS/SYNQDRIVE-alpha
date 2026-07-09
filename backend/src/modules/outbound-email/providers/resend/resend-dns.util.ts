import { OrgEmailDomainStatus } from '@prisma/client';
import type { DnsRecordHint } from '../../utils/email-domain.util';
import { normalizeDomain } from '../../utils/email-domain.util';
import type { ResendDnsRecord } from './resend-api.types';

function mapRecordPurpose(record: ResendDnsRecord): DnsRecordHint['purpose'] {
  const label = record.record.toUpperCase();
  if (label.includes('DKIM')) return 'DKIM';
  if (label.includes('DMARC')) return 'DMARC';
  if (label.includes('RETURN') || label.includes('BOUNCE') || label.includes('MX')) {
    return 'RETURN_PATH';
  }
  if (label.includes('SPF') || record.type.toUpperCase() === 'TXT') {
    if (record.value.toLowerCase().includes('v=spf1')) return 'SPF';
    if (record.value.toLowerCase().includes('v=dmarc1')) return 'DMARC';
    if (record.name.toLowerCase().includes('_domainkey')) return 'DKIM';
  }
  return 'SPF';
}

function mapRecordStatus(status: string): DnsRecordHint['status'] {
  const normalized = status.toLowerCase();
  if (normalized === 'verified') return 'verified';
  return 'pending';
}

function fqdnHost(name: string, domain: string): string {
  const normalizedDomain = normalizeDomain(domain);
  const trimmed = name.trim().replace(/\.$/, '');
  if (!trimmed || trimmed === '@') return normalizedDomain;
  if (trimmed.endsWith(normalizedDomain)) return trimmed;
  if (trimmed.includes('.')) return `${trimmed}.${normalizedDomain}`;
  return `${trimmed}.${normalizedDomain}`;
}

export function mapResendRecordsToHints(
  domain: string,
  records: ResendDnsRecord[] | undefined,
): DnsRecordHint[] {
  if (!records?.length) return [];

  const mapped: DnsRecordHint[] = [];
  const seen = new Set<string>();

  for (const record of records) {
    const purpose = mapRecordPurpose(record);
    const type = record.type.toUpperCase();
    if (type !== 'TXT' && type !== 'CNAME' && type !== 'MX') continue;
    if (record.record.toLowerCase().includes('tracking')) continue;

    const host = fqdnHost(record.name, domain);
    const key = `${type}:${host}:${purpose}`;
    if (seen.has(key)) continue;
    seen.add(key);

    mapped.push({
      type: type as DnsRecordHint['type'],
      host,
      value: record.value,
      purpose,
      status: mapRecordStatus(record.status),
    });
  }

  const hasDmarc = mapped.some((r) => r.purpose === 'DMARC');
  if (!hasDmarc) {
    const normalized = normalizeDomain(domain);
    mapped.push({
      type: 'TXT',
      host: `_dmarc.${normalized}`,
      value: `v=DMARC1; p=none; rua=mailto:dmarc@${normalized}`,
      purpose: 'DMARC',
      status: 'pending',
    });
  }

  return mapped;
}

export function mapResendDomainStatus(status: string): OrgEmailDomainStatus {
  const normalized = status.toLowerCase();
  if (normalized === 'verified') return OrgEmailDomainStatus.VERIFIED;
  if (normalized === 'failed' || normalized === 'temporary_failure') {
    return OrgEmailDomainStatus.FAILED;
  }
  if (normalized === 'pending') return OrgEmailDomainStatus.VERIFYING;
  return OrgEmailDomainStatus.PENDING_DNS;
}

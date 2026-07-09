import { Injectable, Logger } from '@nestjs/common';
import { OrgEmailDomainStatus } from '@prisma/client';
import type { DnsRecordHint } from '../../utils/email-domain.util';
import { ResendApiClient, ResendApiError } from './resend-api.client';
import {
  mapResendDomainStatus,
  mapResendRecordsToHints,
} from './resend-dns.util';

export interface ResendDomainProvisionResult {
  providerDomainId: string;
  dnsRecords: DnsRecordHint[];
  status: OrgEmailDomainStatus;
}

export interface ResendDomainVerificationResult {
  status: OrgEmailDomainStatus;
  dnsRecords: DnsRecordHint[];
  failureReason?: string;
  providerDomainId?: string;
}

@Injectable()
export class ResendDomainAdapter {
  private readonly logger = new Logger(ResendDomainAdapter.name);

  constructor(private readonly client: ResendApiClient) {}

  isAvailable(): boolean {
    return this.client.isConfigured();
  }

  async provisionDomain(domain: string): Promise<ResendDomainProvisionResult> {
    const created = await this.client.createDomain(domain);
    const dnsRecords = mapResendRecordsToHints(domain, created.records);
    return {
      providerDomainId: created.id,
      dnsRecords,
      status: mapResendDomainStatus(created.status),
    };
  }

  async verifyDomain(
    domain: string,
    providerDomainId: string,
    currentRecords: DnsRecordHint[],
  ): Promise<ResendDomainVerificationResult> {
    try {
      await this.client.verifyDomain(providerDomainId);
    } catch (err) {
      if (!(err instanceof ResendApiError) || err.statusCode >= 500) {
        throw err;
      }
      this.logger.warn(
        `Resend verify trigger failed for ${domain}: ${err instanceof Error ? err.message : err}`,
      );
    }

    const remote = await this.client.getDomain(providerDomainId);
    const dnsRecords = mapResendRecordsToHints(domain, remote.records);
    const status = mapResendDomainStatus(remote.status);

    if (status === OrgEmailDomainStatus.FAILED) {
      return {
        status,
        dnsRecords: dnsRecords.length ? dnsRecords : currentRecords,
        failureReason: 'DNS-Einträge konnten nicht verifiziert werden',
        providerDomainId,
      };
    }

    if (status !== OrgEmailDomainStatus.VERIFIED && dnsRecords.length === 0) {
      return {
        status,
        dnsRecords: currentRecords,
        providerDomainId,
      };
    }

    return {
      status,
      dnsRecords: dnsRecords.length ? dnsRecords : currentRecords,
      providerDomainId,
    };
  }
}

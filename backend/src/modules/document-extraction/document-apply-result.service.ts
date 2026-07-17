import { Injectable } from '@nestjs/common';
import { buildPublicDocumentApplyResult } from './document-apply-result.mapper';
import type { PublicDocumentApplyResultDto } from './document-apply-result.types';

type ExtractionRecord = {
  id: string;
  vehicleId: string | null;
  organizationId?: string | null;
  status: string;
  plausibility?: unknown;
};

@Injectable()
export class DocumentApplyResultService {
  buildForRecord(record: ExtractionRecord): PublicDocumentApplyResultDto | null {
    return buildPublicDocumentApplyResult(record);
  }
}

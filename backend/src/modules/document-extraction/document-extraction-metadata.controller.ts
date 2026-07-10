import { Controller, Get, UseGuards } from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { DocumentExtractionMetadataService } from './document-extraction-metadata.service';
import { DocumentExtractionHealthService } from './document-extraction-health.service';

/**
 * Canonical, tenant-safe metadata for AI document upload flows.
 * No vehicle scope required — values are global product constraints.
 */
@Controller('document-extractions')
@UseGuards(RolesGuard)
export class DocumentExtractionMetadataController {
  constructor(
    private readonly metadataService: DocumentExtractionMetadataService,
    private readonly healthService: DocumentExtractionHealthService,
  ) {}

  @Get('metadata')
  getMetadata() {
    return this.metadataService.getMetadata();
  }

  @Get('health')
  getHealth() {
    return this.healthService.getHealth();
  }
}

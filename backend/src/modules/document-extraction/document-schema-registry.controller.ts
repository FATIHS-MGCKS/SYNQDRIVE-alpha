import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { DocumentSchemaRegistryService } from './document-schema-registry.service';

@Controller('document-extractions/schemas')
@UseGuards(RolesGuard)
export class DocumentSchemaRegistryController {
  constructor(private readonly registryService: DocumentSchemaRegistryService) {}

  @Get()
  listSchemas() {
    return this.registryService.listSchemas();
  }

  @Get('resolve')
  resolveSchema(
    @Query('subtype') subtype?: string,
    @Query('legacyDocumentType') legacyDocumentType?: string,
  ) {
    return this.registryService.resolveSchema({
      documentSubtype: subtype ?? null,
      legacyDocumentType: legacyDocumentType ?? null,
    });
  }

  @Get(':subtype')
  getSchema(
    @Param('subtype') subtype: string,
    @Query('legacyDocumentType') legacyDocumentType?: string,
  ) {
    return this.registryService.getSchema(subtype, legacyDocumentType ?? null);
  }
}

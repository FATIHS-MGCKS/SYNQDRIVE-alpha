import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import documentsConfig from '@config/documents.config';
import { validateDocumentStorageConfig } from './document-storage.config-validator';

@Injectable()
export class DocumentStorageStartupService implements OnModuleInit {
  private readonly logger = new Logger(DocumentStorageStartupService.name);

  constructor(
    @Inject(documentsConfig.KEY)
    private readonly config: ConfigType<typeof documentsConfig>,
  ) {}

  onModuleInit(): void {
    const result = validateDocumentStorageConfig(this.config);
    for (const warning of result.warnings) {
      this.logger.warn(`Document storage config: ${warning}`);
    }
    if (!result.ok) {
      throw new Error(
        `Document storage configuration invalid: ${result.errors.join('; ')}`,
      );
    }
    this.logger.log(
      `Document storage ready — provider=${this.config.storageProvider}`,
    );
  }
}

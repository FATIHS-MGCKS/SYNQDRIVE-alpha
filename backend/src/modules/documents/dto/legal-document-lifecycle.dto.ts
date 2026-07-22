import { IsISO8601, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class LegalDocumentChangeSummaryDto {
  @IsOptional()
  @IsString()
  changeSummary?: string;
}

export class LegalDocumentScheduleDto extends LegalDocumentChangeSummaryDto {
  @IsISO8601()
  validFrom!: string;
}

export class LegalDocumentRevokeDto extends LegalDocumentChangeSummaryDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  statusReason!: string;
}

export class LegalDocumentArchiveDto extends LegalDocumentChangeSummaryDto {
  @IsOptional()
  @IsString()
  statusReason?: string;
}

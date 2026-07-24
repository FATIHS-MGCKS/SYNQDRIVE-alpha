import { ComplianceEvidenceReportType } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsOptional } from 'class-validator';

export class CreateComplianceEvidenceExportDto {
  @IsEnum(ComplianceEvidenceReportType)
  reportType!: ComplianceEvidenceReportType;

  @IsOptional()
  @IsDateString()
  periodFrom?: string;

  @IsOptional()
  @IsDateString()
  periodTo?: string;

  @IsOptional()
  @IsBoolean()
  async?: boolean;
}

export class ListComplianceEvidenceReportsQueryDto {
  @IsOptional()
  @IsDateString()
  periodFrom?: string;

  @IsOptional()
  @IsDateString()
  periodTo?: string;

  @IsOptional()
  @IsEnum(ComplianceEvidenceReportType)
  reportType?: ComplianceEvidenceReportType;
}

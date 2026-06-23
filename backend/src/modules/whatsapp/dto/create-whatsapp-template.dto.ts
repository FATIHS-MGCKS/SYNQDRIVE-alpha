import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { WhatsAppTemplateCategory } from '@prisma/client';

export class CreateWhatsAppTemplateDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsEnum(WhatsAppTemplateCategory)
  category!: WhatsAppTemplateCategory;

  @IsString()
  bodyTemplate!: string;

  @IsOptional()
  @IsObject()
  variableSchema?: Record<string, unknown>;
}

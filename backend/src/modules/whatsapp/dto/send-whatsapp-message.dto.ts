import { IsOptional, IsString } from 'class-validator';

export class SendWhatsAppMessageDto {
  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  senderName?: string;

  @IsOptional()
  @IsString()
  suggestionId?: string;
}

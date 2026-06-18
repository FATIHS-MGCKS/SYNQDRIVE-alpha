import { IsOptional, IsString, MaxLength } from 'class-validator';

const CAPTION_MAX = 500;

export class AddDamageImageDto {
  @IsString()
  imageData!: string;

  @IsOptional()
  @IsString()
  @MaxLength(CAPTION_MAX)
  caption?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  uploadedBy?: string;
}

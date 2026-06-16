import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateMyProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(trim)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(trim)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Transform(({ value }) => {
    if (value === null || value === undefined) return null;
    const t = String(value).trim();
    return t.length ? t : null;
  })
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Transform(({ value }) => {
    if (value === null || value === undefined) return null;
    const t = String(value).trim();
    return t.length ? t : null;
  })
  mobile?: string | null;
}

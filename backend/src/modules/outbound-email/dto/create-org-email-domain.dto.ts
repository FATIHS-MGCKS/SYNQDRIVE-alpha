import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateOrgEmailDomainDto {
  @IsString()
  @MaxLength(253)
  domain!: string;

  @IsEmail()
  fromEmail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  fromName?: string;

  @IsOptional()
  @IsEmail()
  replyToEmail?: string;
}

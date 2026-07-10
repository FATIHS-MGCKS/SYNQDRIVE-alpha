import { IsOptional, IsString, Matches } from 'class-validator';

export class AddOrgEmailDomainDto {
  @IsString()
  @Matches(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i, {
    message: 'Invalid domain name',
  })
  domain!: string;

  @IsOptional()
  @IsString()
  fromLocalPart?: string;
}

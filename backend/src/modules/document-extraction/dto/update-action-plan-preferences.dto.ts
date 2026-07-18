import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class UpdateActionPlanPreferencesDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  disabledOptionalActions!: string[];
}

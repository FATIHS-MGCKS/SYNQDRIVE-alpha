import { IsString } from 'class-validator';

export class UpdateVoiceOnboardingStepDto {
  @IsString()
  step!: string;
}

import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { VoiceTestScenarioId, VoiceTestVerdict } from '../voice-test-scenarios';

export class RunVoiceTestDto {
  @IsString()
  @IsIn([
    'booking_status',
    'pickup',
    'return_vehicle',
    'missing_document',
    'open_invoice',
    'breakdown',
    'damage',
    'unknown_question',
    'sensitive_change',
    'staff_handover',
  ])
  scenarioId!: VoiceTestScenarioId;

  @IsOptional()
  @IsIn(['simulation', 'live'])
  mode?: 'simulation' | 'live';
}

export class RecordVoiceTestVerdictDto {
  @IsIn(['PASS', 'PARTIAL', 'FAIL'])
  verdict!: VoiceTestVerdict;

  @IsString()
  @MaxLength(2000)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  operatorNotes?: string;
}

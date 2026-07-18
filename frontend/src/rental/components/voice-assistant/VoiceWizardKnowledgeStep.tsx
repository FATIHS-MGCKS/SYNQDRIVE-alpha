import type { VoiceAssistantData } from '../../../lib/api';
import { VoiceKnowledgeCenterPanel } from './VoiceKnowledgeCenterPanel';

export interface VoiceWizardKnowledgeStepProps {
  orgId: string;
  assistant: VoiceAssistantData;
}

export function VoiceWizardKnowledgeStep({ orgId, assistant }: VoiceWizardKnowledgeStepProps) {
  return <VoiceKnowledgeCenterPanel orgId={orgId} assistant={assistant} />;
}

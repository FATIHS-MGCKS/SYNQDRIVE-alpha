import type {
  CreateAgentInput,
  ElevenLabsProviderHealth,
  ElevenLabsVoiceView,
  ElevenLabsWorkspaceValidation,
  ImportTwilioPhoneNumberInput,
  MaskedElevenLabsAgentView,
  MaskedElevenLabsConversationView,
  MaskedElevenLabsDeploymentView,
  MaskedElevenLabsPhoneNumberView,
  MaskedOutboundCallView,
  MaskedPostCallConfigView,
  MaskedToolsConfigView,
  OutboundCallPreparation,
  PostCallConfigurationInput,
  ToolsConfigurationInput,
  UpdateAgentInput,
} from './elevenlabs-provider.types';

export const ELEVENLABS_PROVIDER_PORT = Symbol('ELEVENLABS_PROVIDER_PORT');

export interface ElevenLabsProviderPort {
  checkHealth(): Promise<ElevenLabsProviderHealth>;
  validateWorkspace(): Promise<ElevenLabsWorkspaceValidation>;

  listVoices(): Promise<ElevenLabsVoiceView[]>;

  getAgent(params: {
    organizationId: string;
    deploymentId: string;
  }): Promise<MaskedElevenLabsAgentView>;

  createAgent(input: CreateAgentInput): Promise<MaskedElevenLabsAgentView>;
  updateAgent(input: UpdateAgentInput): Promise<MaskedElevenLabsAgentView>;

  getAgentDeployment(params: {
    organizationId: string;
    deploymentId: string;
  }): Promise<MaskedElevenLabsDeploymentView>;

  listPhoneNumbers(params: {
    organizationId: string;
  }): Promise<MaskedElevenLabsPhoneNumberView[]>;

  importTwilioPhoneNumber(
    input: ImportTwilioPhoneNumberInput,
  ): Promise<MaskedElevenLabsPhoneNumberView>;

  assignPhoneNumberToAgent(params: {
    organizationId: string;
    phoneNumberId: string;
    deploymentId: string;
  }): Promise<void>;

  unassignPhoneNumberFromAgent(params: {
    organizationId: string;
    phoneNumberId: string;
  }): Promise<void>;

  prepareOutboundCall(params: {
    organizationId: string;
    deploymentId: string;
    phoneNumberId: string;
    toE164: string;
  }): Promise<OutboundCallPreparation>;

  startOutboundCall(params: {
    organizationId: string;
    deploymentId: string;
    phoneNumberId: string;
    toE164: string;
  }): Promise<MaskedOutboundCallView>;

  getConversation(params: {
    organizationId: string;
    deploymentId: string;
    conversationId: string;
  }): Promise<MaskedElevenLabsConversationView>;

  getPostCallConfiguration(params: {
    organizationId: string;
    deploymentId: string;
  }): Promise<MaskedPostCallConfigView>;

  updatePostCallConfiguration(
    params: {
      organizationId: string;
      deploymentId: string;
    } & PostCallConfigurationInput,
  ): Promise<MaskedPostCallConfigView>;

  getToolsConfiguration(params: {
    organizationId: string;
    deploymentId: string;
  }): Promise<MaskedToolsConfigView>;

  updateToolsConfiguration(
    params: {
      organizationId: string;
      deploymentId: string;
    } & ToolsConfigurationInput,
  ): Promise<MaskedToolsConfigView>;
}

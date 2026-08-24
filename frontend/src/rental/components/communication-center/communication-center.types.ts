export type CommunicationPrimaryTab =
  | 'inbox'
  | 'channels'
  | 'ai-activity'
  | 'automations'
  | 'settings';

export type CommunicationSettingsSection = 'overview' | 'whatsapp' | 'voice' | 'sms';

export type CommunicationChannelsSection =
  | 'overview'
  | 'whatsapp'
  | 'voice'
  | 'sms'
  | 'email';

export type CommunicationChannel = 'all' | 'whatsapp' | 'voice' | 'sms';

export type CommunicationMobilePane = 'inbox' | 'conversation' | 'context';

export type CommunicationWhatsAppChannelSubview = 'overview' | 'configuration' | 'templates';

export type CommunicationVoiceIntent =
  | 'overview'
  | 'settings'
  | 'analytics'
  | 'telephony'
  | 'test'
  | 'automations'
  | 'builder'
  | 'conversations';

export interface CommunicationCenterShellState {
  primaryTab: CommunicationPrimaryTab;
  channel: CommunicationChannel;
  selectedConversationId: string | null;
  mobilePane: CommunicationMobilePane;
  contextPanelOpen: boolean;
}

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

export interface CommunicationCenterShellState {
  primaryTab: CommunicationPrimaryTab;
  channel: CommunicationChannel;
  selectedConversationId: string | null;
  mobilePane: CommunicationMobilePane;
  contextPanelOpen: boolean;
}

export type CommunicationPrimaryTab = 'inbox' | 'settings';

export type CommunicationChannel = 'all' | 'whatsapp' | 'voice' | 'sms';

export type CommunicationMobilePane = 'inbox' | 'conversation' | 'context';

export interface CommunicationCenterShellState {
  primaryTab: CommunicationPrimaryTab;
  channel: CommunicationChannel;
  selectedConversationId: string | null;
  mobilePane: CommunicationMobilePane;
  contextPanelOpen: boolean;
}

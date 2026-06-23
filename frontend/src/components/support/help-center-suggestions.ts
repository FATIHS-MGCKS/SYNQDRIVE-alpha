import type { SupportTicketCategory } from '../../lib/api';

export interface HelpArticleSuggestion {
  id: string;
  title: string;
  sectionId: string;
}

const HELP_ARTICLE_INDEX: HelpArticleSuggestion[] = [
  { id: 'first-steps', title: 'Wie fange ich an?', sectionId: 'getting-started' },
  { id: 'dashboard-overview', title: 'Was zeigt das Dashboard?', sectionId: 'dashboard' },
  { id: 'bookings-overview', title: 'Buchungen verwalten', sectionId: 'bookings' },
  { id: 'fleet-overview', title: 'Flotte verwalten', sectionId: 'fleet' },
  { id: 'vehicle-detail', title: 'Fahrzeugdetails', sectionId: 'fleet' },
  { id: 'fleet-health', title: 'Flotten-Gesundheit', sectionId: 'insights' },
  { id: 'invoices', title: 'Rechnungen & Finanzen', sectionId: 'finance' },
  { id: 'fleet-connectivity', title: 'Flotten-Konnektivität', sectionId: 'administration' },
  { id: 'data-authorization', title: 'Datenfreigaben', sectionId: 'administration' },
  { id: 'support-tickets', title: 'Support-Tickets', sectionId: 'support-section' },
  { id: 'document-upload', title: 'Dokumente hochladen', sectionId: 'ai-tools' },
  { id: 'task-management', title: 'Aufgaben verwalten', sectionId: 'tasks-section' },
];

const CATEGORY_SECTIONS: Record<SupportTicketCategory, string[]> = {
  APP: ['getting-started', 'dashboard'],
  VEHICLE: ['fleet', 'insights'],
  BOOKING: ['bookings'],
  BILLING: ['finance'],
  DIMO_TELEMETRY: ['administration', 'fleet'],
  ACCOUNT: ['administration', 'getting-started'],
  DOCUMENTS: ['ai-tools', 'data-quality'],
  DATA_AUTHORIZATION: ['administration'],
  HEALTH: ['insights', 'fleet'],
  OTHER: ['support-section', 'getting-started'],
};

export function suggestHelpArticles(
  category: SupportTicketCategory,
  limit = 3,
): HelpArticleSuggestion[] {
  const sections = new Set(CATEGORY_SECTIONS[category] ?? ['support-section']);
  return HELP_ARTICLE_INDEX.filter((a) => sections.has(a.sectionId)).slice(0, limit);
}

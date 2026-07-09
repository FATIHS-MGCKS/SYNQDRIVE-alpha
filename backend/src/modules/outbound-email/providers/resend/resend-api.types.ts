export interface ResendDnsRecord {
  record: string;
  name: string;
  type: string;
  value: string;
  status: string;
  ttl?: string;
  priority?: number;
}

export interface ResendDomainResponse {
  id: string;
  name: string;
  status: string;
  records?: ResendDnsRecord[];
}

export interface ResendSendAttachment {
  filename: string;
  content: string;
}

export interface ResendSendRequest {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  reply_to?: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: ResendSendAttachment[];
  tags?: Array<{ name: string; value: string }>;
}

export interface ResendSendResponse {
  id: string;
}

export interface ResendApiErrorBody {
  message?: string;
  name?: string;
}

export type ResendEmailWebhookType =
  | 'email.sent'
  | 'email.delivered'
  | 'email.bounced'
  | 'email.complained'
  | 'email.delivery_delayed'
  | 'email.failed'
  | 'email.opened'
  | 'email.clicked';

export interface ResendEmailWebhookPayload {
  type: ResendEmailWebhookType | string;
  created_at?: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string[];
    subject?: string;
    bounce?: { message?: string };
    click?: { link?: string };
  };
}

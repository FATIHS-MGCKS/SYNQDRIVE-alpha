import { IsIn, IsOptional, IsString } from 'class-validator';
import type { WhatsAppQuickActionId } from '../whatsapp-conversation-context.types';
import type { TaskCategoryFromConversation } from '../whatsapp-quick-actions.service';

const TASK_CATEGORIES: TaskCategoryFromConversation[] = [
  'CUSTOMER_COMMUNICATION',
  'DAMAGE',
  'DOCUMENT',
  'PAYMENT',
  'BOOKING',
  'VEHICLE',
];

export class WhatsAppQuickActionDto {
  @IsOptional()
  @IsString()
  bookingId?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  assignedUserId?: string;

  @IsOptional()
  @IsIn(TASK_CATEGORIES)
  taskCategory?: TaskCategoryFromConversation;

  @IsOptional()
  @IsString()
  taskTitle?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export const WHATSAPP_QUICK_ACTION_IDS: WhatsAppQuickActionId[] = [
  'link_booking',
  'link_customer',
  'link_vehicle',
  'human_review',
  'assign_user',
  'create_task',
  'request_missing_documents',
  'send_pickup_instructions',
  'send_return_instructions',
  'send_handover_link',
  'send_return_link',
  'send_payment_deposit_reminder',
  'create_damage_followup_task',
  'close_conversation',
  'reopen_conversation',
];

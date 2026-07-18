import { VoiceAssistantStatus } from '@prisma/client';
import { resolveAllowedMcpToolsForAssistant } from '@modules/voice-call-orchestration/voice-mcp-tools.util';
import {
  defaultToolPermissions,
  VoicePermissionMode,
} from './voice-assistant-permissions';

function assistantWithPermissions(toolPermissions: Record<string, string>) {
  return {
    id: 'va-1',
    organizationId: 'org-1',
    status: VoiceAssistantStatus.DRAFT,
    toolPermissions,
    permAnswerQuestions: true,
    permLookupCustomer: true,
    permSearchBookings: true,
    permCreateActions: false,
    permModifyRecords: false,
    permContactCustomer: false,
    outboundEnabled: false,
  } as never;
}

describe('voice permission to MCP mapping', () => {
  it('excludes tools when capability is DISABLED', () => {
    const permissions = defaultToolPermissions();
    permissions.cancelBooking = VoicePermissionMode.DISABLED;
    permissions.modifyBooking = VoicePermissionMode.DISABLED;

    const allowed = resolveAllowedMcpToolsForAssistant(
      assistantWithPermissions(permissions as Record<string, string>),
    );

    expect(allowed).not.toContain('request_booking_change');
  });

  it('includes read tools for SUGGEST_ONLY capabilities', () => {
    const permissions = defaultToolPermissions();
    permissions.customerLookup = VoicePermissionMode.SUGGEST_ONLY;
    permissions.bookingSearch = VoicePermissionMode.SUGGEST_ONLY;

    const allowed = resolveAllowedMcpToolsForAssistant(
      assistantWithPermissions(permissions as Record<string, string>),
    );

    expect(allowed).toContain('identify_customer');
    expect(allowed).toContain('find_booking');
  });

  it('respects safe defaults — cancel and record mutation remain disabled', () => {
    const permissions = defaultToolPermissions();
    const allowed = resolveAllowedMcpToolsForAssistant(
      assistantWithPermissions(permissions as Record<string, string>),
    );

    expect(permissions.cancelBooking).toBe(VoicePermissionMode.DISABLED);
    expect(permissions.modifyRecords).toBe(VoicePermissionMode.DISABLED);
    expect(allowed).not.toContain('create_customer_note');
  });
});

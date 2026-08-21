import { mergeConversationContext, diffConversationContextPatch } from './communication-context-merge';

describe('communication-context-merge', () => {
  const base = {
    customerId: 'cust-1',
    bookingId: null as string | null,
    vehicleId: undefined as string | undefined,
    stationId: null,
    assignedUserId: null,
    assignedAgentRef: null,
    assignedAgentType: null,
  };

  it('undefined does not clear existing values', () => {
    const merged = mergeConversationContext(base, { customerId: undefined, bookingId: 'book-1' });
    expect(merged.customerId).toBe('cust-1');
    expect(merged.bookingId).toBe('book-1');
  });

  it('null explicitly clears a field', () => {
    const merged = mergeConversationContext(base, { customerId: null });
    expect(merged.customerId).toBeNull();
  });

  it('diff returns only changed fields', () => {
    const patch = diffConversationContextPatch(
      {
        customerId: null,
        bookingId: null,
        vehicleId: null,
        stationId: null,
        assignedUserId: null,
        assignedAgentRef: null,
        assignedAgentType: null,
      },
      { customerId: 'cust-2', bookingId: 'book-2' },
    );
    expect(patch).toEqual({ customerId: 'cust-2', bookingId: 'book-2' });
  });
});

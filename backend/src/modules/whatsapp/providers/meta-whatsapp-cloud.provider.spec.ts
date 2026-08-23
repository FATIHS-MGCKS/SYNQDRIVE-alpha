import { MetaWhatsAppCloudProvider } from './meta-whatsapp-cloud.provider';

describe('MetaWhatsAppCloudProvider webhook parsing', () => {
  const provider = new MetaWhatsAppCloudProvider();

  const statusPayload = {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: 'pn-1' },
              statuses: [
                {
                  id: 'wamid.lifecycle.1',
                  status: 'delivered',
                  timestamp: '1724256000',
                },
              ],
            },
          },
        ],
      },
    ],
  };

  it('builds stable externalEventId for delivery/read replays using provider timestamp', () => {
    const first = provider.parseWebhook(statusPayload as any, {});
    const replay = provider.parseWebhook(statusPayload as any, {});

    expect(first.entries).toHaveLength(1);
    expect(first.entries[0].externalEventId).toBe('status:wamid.lifecycle.1:delivered:1724256000');
    expect(replay.entries[0].externalEventId).toBe(first.entries[0].externalEventId);
  });

  it('builds stable externalEventId for inbound message replays', () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'pn-1' },
                messages: [
                  {
                    id: 'wamid.inbound.1',
                    from: '491701234567',
                    timestamp: '1724256001',
                    type: 'text',
                    text: { body: 'Hello' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const first = provider.parseWebhook(payload as any, {});
    const replay = provider.parseWebhook(payload as any, {});

    expect(first.entries[0].externalEventId).toBe('msg:wamid.inbound.1');
    expect(replay.entries[0].externalEventId).toBe('msg:wamid.inbound.1');
  });

  it('parses inbound image and document messages', () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'pn-1' },
                messages: [
                  {
                    id: 'wamid.image.1',
                    from: '491701234567',
                    timestamp: '1724256002',
                    type: 'image',
                    image: { id: 'media-img', mime_type: 'image/jpeg', caption: 'Look' },
                  },
                  {
                    id: 'wamid.doc.1',
                    from: '491701234567',
                    timestamp: '1724256003',
                    type: 'document',
                    document: {
                      id: 'media-doc',
                      mime_type: 'application/pdf',
                      filename: 'invoice.pdf',
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const parsed = provider.parseWebhook(payload as any, {});
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[0].inboundMessage?.messageType).toBe('image');
    expect(parsed.entries[0].inboundMessage?.media?.providerMediaId).toBe('media-img');
    expect(parsed.entries[1].inboundMessage?.messageType).toBe('document');
    expect(parsed.entries[1].inboundMessage?.media?.fileName).toBe('invoice.pdf');
  });
});

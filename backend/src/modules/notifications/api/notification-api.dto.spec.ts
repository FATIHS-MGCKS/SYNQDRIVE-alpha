import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { NotificationCountsQueryDto, ListNotificationsQueryDto } from './dto/notification-api.dto';

describe('NotificationCountsQueryDto', () => {
  it('rejects invalid attentionScope', async () => {
    const dto = plainToInstance(NotificationCountsQueryDto, {
      attentionScope: 'INVALID_SCOPE',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'attentionScope')).toBe(true);
  });

  it('accepts FLEET_READINESS and OPERATIONS', async () => {
    for (const scope of ['FLEET_READINESS', 'OPERATIONS', 'fleet_readiness', 'operations']) {
      const dto = plainToInstance(NotificationCountsQueryDto, { attentionScope: scope });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    }
  });
});

describe('ListNotificationsQueryDto', () => {
  it('rejects invalid attentionScope', async () => {
    const dto = plainToInstance(ListNotificationsQueryDto, {
      attentionScope: 'INVALID_SCOPE',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'attentionScope')).toBe(true);
  });
});

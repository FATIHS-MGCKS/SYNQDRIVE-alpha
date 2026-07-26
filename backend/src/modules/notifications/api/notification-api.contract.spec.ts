/**
 * Contract tests for notification API query DTO validation surface.
 */
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListNotificationsQueryDto } from './dto/notification-api.dto';

describe('Notification API contract (query DTO)', () => {
  it('accepts cursor pagination and readState filters', async () => {
    const dto = plainToInstance(ListNotificationsQueryDto, {
      cursor: 'abc123',
      limit: '25',
      readState: 'unread',
      timeField: 'createdAt',
      domain: 'VEHICLE_HEALTH',
      severity: 'WARNING,CRITICAL',
      activeOnly: 'true',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.readState).toBe('unread');
    expect(dto.severity).toEqual(expect.arrayContaining(['WARNING', 'CRITICAL']));
  });

  it('rejects invalid readState values', async () => {
    const dto = plainToInstance(ListNotificationsQueryDto, {
      readState: 'archived',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects search strings over max length', async () => {
    const dto = plainToInstance(ListNotificationsQueryDto, {
      search: 'x'.repeat(121),
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

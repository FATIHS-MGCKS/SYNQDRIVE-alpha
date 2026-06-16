import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  ChangeOrgUserPasswordDto,
  CreateOrgUserDto,
  UpdateOrgUserDto,
} from './org-user.dto';

async function validateDto<T extends object>(cls: new () => T, payload: object) {
  const dto = plainToInstance(cls, payload);
  return validate(dto);
}

describe('Org user DTO validation', () => {
  it('rejects invalid email on create', async () => {
    const errors = await validateDto(CreateOrgUserDto, {
      email: 'bad',
      firstName: 'A',
      lastName: 'B',
      role: 'WORKER',
    });
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('rejects password shorter than 12 on create', async () => {
    const errors = await validateDto(CreateOrgUserDto, {
      email: 'a@test.de',
      firstName: 'A',
      lastName: 'B',
      role: 'WORKER',
      password: 'short',
    });
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });

  it('rejects unknown permission module keys', async () => {
    const errors = await validateDto(CreateOrgUserDto, {
      email: 'a@test.de',
      firstName: 'A',
      lastName: 'B',
      role: 'WORKER',
      permissions: { 'super-admin': { read: true, write: true } },
    });
    expect(errors.some((e) => e.property === 'permissions')).toBe(true);
  });

  it('rejects negative payment terms is N/A — accepts valid permissions', async () => {
    const errors = await validateDto(CreateOrgUserDto, {
      email: 'a@test.de',
      firstName: 'A',
      lastName: 'B',
      role: 'WORKER',
      permissions: { bookings: { read: true, write: false } },
      stationIds: ['station-1'],
    });
    expect(errors.length).toBe(0);
  });

  it('requires manage-level password min length', async () => {
    const errors = await validateDto(ChangeOrgUserPasswordDto, {
      password: '1234567',
    });
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });

  it('validates membership role enum on update', async () => {
    const errors = await validateDto(UpdateOrgUserDto, {
      role: 'INVALID',
    });
    expect(errors.some((e) => e.property === 'role')).toBe(true);
  });
});

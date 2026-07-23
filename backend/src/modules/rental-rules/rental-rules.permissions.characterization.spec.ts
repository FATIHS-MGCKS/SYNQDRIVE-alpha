import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PERMISSION_KEY } from '@shared/decorators/require-permission.decorator';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { RENTAL_RULE_PERMISSION_REQUIREMENTS } from './rental-rules-permission.constants';
import { RentalRulesController } from './rental-rules.controller';

function permissionOf(target: object, method: string) {
  const handler = (target as Record<string, (...args: unknown[]) => unknown>)[method];
  return Reflect.getMetadata(PERMISSION_KEY, handler);
}

describe('RentalRulesController permissions characterization', () => {
  it('applies OrgScopingGuard, RolesGuard and PermissionsGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, RentalRulesController) ?? [];
    expect(guards).toEqual(
      expect.arrayContaining([OrgScopingGuard, RolesGuard, PermissionsGuard]),
    );
  });

  it.each([
    ['getOverview', 'rental_rules.read'],
    ['listFleetVehicles', 'rental_rules.read'],
    ['getDefaults', 'rental_rules.read'],
    ['listCategories', 'rental_rules.read'],
    ['getCategory', 'rental_rules.read'],
    ['listCategoryVehicles', 'rental_rules.read'],
    ['getVehicleRequirements', 'rental_rules.read'],
    ['getVehicleEffectiveRules', 'rental_rules.read'],
    ['patchDefaults', 'rental_rules.write'],
    ['createCategory', 'rental_rules.write'],
    ['updateCategory', 'rental_rules.write'],
    ['disableCategory', 'rental_rules.publish'],
    ['assignCategoryVehicles', 'rental_rules.assign_vehicles'],
    ['upsertVehicleOverrides', 'rental_rules.manage_overrides'],
  ] as const)('%s requires %s', (method, action) => {
    const requirement = RENTAL_RULE_PERMISSION_REQUIREMENTS[action];
    expect(permissionOf(RentalRulesController.prototype, method)).toEqual({
      module: requirement.module,
      level: requirement.level,
    });
  });

  it('does not use coarse @Roles ORG_ADMIN decorators on mutations', () => {
    const proto = RentalRulesController.prototype as unknown as Record<string, unknown>;
    for (const method of [
      'patchDefaults',
      'createCategory',
      'updateCategory',
      'disableCategory',
      'assignCategoryVehicles',
      'upsertVehicleOverrides',
    ]) {
      expect(Reflect.getMetadata('roles', proto[method] as object)).toBeUndefined();
    }
  });

  it('secures every controller handler with an explicit permission', () => {
    const proto = RentalRulesController.prototype as unknown as Record<string, unknown>;
    const handlers = [
      'getOverview',
      'listFleetVehicles',
      'getDefaults',
      'patchDefaults',
      'listCategories',
      'createCategory',
      'getCategory',
      'updateCategory',
      'disableCategory',
      'listCategoryVehicles',
      'assignCategoryVehicles',
      'getVehicleRequirements',
      'upsertVehicleOverrides',
      'getVehicleEffectiveRules',
    ];
    for (const method of handlers) {
      expect(permissionOf(proto, method)).toBeDefined();
    }
  });
});

import {
  formatAgentScopeLog,
  normalizeAgentVehicleIds,
  resolveChatVehicleTokenIds,
  resolveVehicleSpecsScope,
  assertVehicleScopeIfRequired,
} from './dimo-agent-vehicle-scope.util';

describe('dimo-agent-vehicle-scope.util', () => {
  describe('normalizeAgentVehicleIds', () => {
    it('returns undefined for empty input', () => {
      expect(normalizeAgentVehicleIds()).toBeUndefined();
      expect(normalizeAgentVehicleIds([])).toBeUndefined();
    });

    it('deduplicates and sorts valid ids', () => {
      expect(normalizeAgentVehicleIds([190497, 872, 872])).toEqual([872, 190497]);
    });
  });

  describe('resolveVehicleSpecsScope', () => {
    it('scopes when tokenId is present', () => {
      const scope = resolveVehicleSpecsScope([872]);
      expect(scope.hasVehicleScope).toBe(true);
      expect(scope.knowledgeOnlyFallback).toBe(false);
      expect(scope.vehicleIds).toEqual([872]);
    });

    it('falls back to knowledge-only without tokenId', () => {
      const scope = resolveVehicleSpecsScope(undefined);
      expect(scope.hasVehicleScope).toBe(false);
      expect(scope.knowledgeOnlyFallback).toBe(true);
      expect(scope.vehicleIds).toBeUndefined();
    });
  });

  describe('resolveChatVehicleTokenIds', () => {
    it('returns single token when resolved vehicle has tokenId', () => {
      expect(resolveChatVehicleTokenIds(872)).toEqual([872]);
    });

    it('returns undefined for general fleet questions', () => {
      expect(resolveChatVehicleTokenIds(null)).toBeUndefined();
      expect(resolveChatVehicleTokenIds(undefined)).toBeUndefined();
    });
  });

  describe('tire_specs scope (knowledge-only)', () => {
    it('tire flows do not require vehicle tokenIds — normalize returns undefined when absent', () => {
      expect(normalizeAgentVehicleIds(undefined)).toBeUndefined();
      expect(normalizeAgentVehicleIds([])).toBeUndefined();
    });
  });

  describe('document_extraction scope', () => {
    it('without tokenId yields no vehicleIds for agent body', () => {
      expect(normalizeAgentVehicleIds(undefined)).toBeUndefined();
    });

    it('with tokenId scopes a single vehicle', () => {
      expect(normalizeAgentVehicleIds([777])).toEqual([777]);
    });
  });

  describe('assertVehicleScopeIfRequired', () => {
    it('errors when vehicle scope is required but missing', () => {
      expect(
        assertVehicleScopeIfRequired({ useCase: 'vehicle_specs', requireVehicleScope: true }, undefined),
      ).toMatch(/No DIMO tokenId/);
    });

    it('passes when scope is present or not required', () => {
      expect(assertVehicleScopeIfRequired({ useCase: 'fleet_chat' }, undefined)).toBeUndefined();
      expect(assertVehicleScopeIfRequired({ useCase: 'fleet_chat' }, [1])).toBeUndefined();
    });
  });

  describe('formatAgentScopeLog', () => {
    it('never includes raw wallet or secrets', () => {
      const line = formatAgentScopeLog({ useCase: 'document_extraction', orgId: 'org-1' }, [872]);
      expect(line).toBe('useCase=document_extraction hasVehicleScope=true vehicleIdsCount=1 orgId=org-1');
      expect(line).not.toMatch(/0x/);
    });
  });
});

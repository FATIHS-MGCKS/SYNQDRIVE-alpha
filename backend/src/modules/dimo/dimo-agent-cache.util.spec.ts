import {
  buildDimoAgentCacheKey,
  hashDimoAgentVehicleIds,
  hashDimoAgentWallet,
  resolveDimoAgentCacheKey,
} from './dimo-agent-cache.util';

const WALLET = '0x0000000000000000000000000000000000000001';
const WALLET_HASH = hashDimoAgentWallet(WALLET);

describe('dimo-agent-cache.util', () => {
  describe('hashDimoAgentWallet', () => {
    it('produces a stable 16-char hex hash without exposing the wallet', () => {
      const hash = hashDimoAgentWallet(WALLET);
      expect(hash).toHaveLength(16);
      expect(hash).toMatch(/^[a-f0-9]+$/);
      expect(hash).not.toContain('0x');
      expect(hashDimoAgentWallet(WALLET)).toBe(hash);
      expect(hashDimoAgentWallet(WALLET.toUpperCase())).toBe(hash);
    });
  });

  describe('hashDimoAgentVehicleIds', () => {
    it('returns none when vehicleIds are absent', () => {
      expect(hashDimoAgentVehicleIds()).toBe('none');
      expect(hashDimoAgentVehicleIds([])).toBe('none');
    });

    it('is order-independent', () => {
      expect(hashDimoAgentVehicleIds([872, 190497])).toBe(hashDimoAgentVehicleIds([190497, 872]));
    });

    it('differs for different vehicle sets', () => {
      expect(hashDimoAgentVehicleIds([872])).not.toBe(hashDimoAgentVehicleIds([190497]));
    });
  });

  describe('buildDimoAgentCacheKey', () => {
    const base = {
      walletHash: WALLET_HASH,
      personality: 'master_technician',
      vehicleScopeHash: hashDimoAgentVehicleIds([872]),
    };

    it('same useCase + wallet + vehicleIds + personality => same key', () => {
      const a = buildDimoAgentCacheKey({ useCase: 'vehicle_specs', ...base });
      const b = buildDimoAgentCacheKey({ useCase: 'vehicle_specs', ...base });
      expect(a).toBe(b);
      expect(a).toMatch(/^dimo:agents:vehicle_specs:global:[a-f0-9]{16}:master_technician:[a-f0-9]{16}$/);
      expect(a).not.toContain(WALLET);
    });

    it('different useCase => different key', () => {
      const vehicle = buildDimoAgentCacheKey({ useCase: 'vehicle_specs', ...base });
      const document = buildDimoAgentCacheKey({ useCase: 'document_extraction', ...base });
      expect(vehicle).not.toBe(document);
    });

    it('document_extraction and vehicle_specs never share a cache key', () => {
      const vehicle = resolveDimoAgentCacheKey(
        { useCase: 'vehicle_specs', vehicleIds: [872] },
        WALLET,
        'master_technician',
      ).cacheKey;
      const document = resolveDimoAgentCacheKey(
        { useCase: 'document_extraction', vehicleIds: [872] },
        WALLET,
        'fleet_manager_pro',
      ).cacheKey;
      expect(vehicle).not.toBe(document);
      expect(vehicle).toContain(':vehicle_specs:');
      expect(document).toContain(':document_extraction:');
    });

    it('different vehicleIds => different key', () => {
      const a = buildDimoAgentCacheKey({
        useCase: 'vehicle_specs',
        ...base,
        vehicleScopeHash: hashDimoAgentVehicleIds([872]),
      });
      const b = buildDimoAgentCacheKey({
        useCase: 'vehicle_specs',
        ...base,
        vehicleScopeHash: hashDimoAgentVehicleIds([190497]),
      });
      expect(a).not.toBe(b);
    });

    it('different personality => different key', () => {
      const a = buildDimoAgentCacheKey({ useCase: 'vehicle_specs', ...base, personality: 'uncle_mechanic' });
      const b = buildDimoAgentCacheKey({ useCase: 'vehicle_specs', ...base, personality: 'fleet_manager_pro' });
      expect(a).not.toBe(b);
    });

    it('includes orgId scope for fleet chat', () => {
      const key = buildDimoAgentCacheKey({
        useCase: 'fleet_chat',
        orgId: 'org-uuid-123',
        walletHash: WALLET_HASH,
        personality: 'fleet_manager_pro',
        vehicleScopeHash: 'none',
      });
      expect(key).toContain(':fleet_chat:org-uuid-123:');
    });
  });
});

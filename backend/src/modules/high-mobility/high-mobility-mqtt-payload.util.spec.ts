import {
  extractHmMqttJsonPreview,
  extractHmSignalData,
  extractHmSignalValue,
  getNestedValue,
  hasNestedPath,
  resolveHmSignalEntry,
  toHmSignalPath,
} from './high-mobility-mqtt-payload.util';

describe('high-mobility-mqtt-payload.util', () => {
  it('extractHmMqttJsonPreview reads message_id, vin, version, data keys', () => {
    const buf = Buffer.from(
      JSON.stringify({
        message_id: 'm1',
        vin: 'WVWZZZ123',
        version: '2',
        data: { diagnostics: { x: 1 }, vehicle_speed: 40 },
      }),
      'utf-8',
    );
    const p = extractHmMqttJsonPreview(buf);
    expect(p.messageId).toBe('m1');
    expect(p.vin).toBe('WVWZZZ123');
    expect(p.version).toBe('2');
    expect(p.dataTopLevelKeys).toContain('diagnostics');
    expect(p.emptyData).toBe(false);
  });

  it('extractHmMqttJsonPreview handles empty data', () => {
    const buf = Buffer.from(JSON.stringify({ message_id: 'x', data: {} }), 'utf-8');
    const p = extractHmMqttJsonPreview(buf);
    expect(p.emptyData).toBe(true);
  });

  it('getNestedValue returns nested paths safely', () => {
    const o = { data: { a: { b: 3 } } };
    expect(getNestedValue(o, 'data.a.b')).toBe(3);
    expect(getNestedValue(o, 'data.missing')).toBeUndefined();
  });

  it('hasNestedPath works', () => {
    expect(hasNestedPath({ x: 1 }, 'x')).toBe(true);
    expect(hasNestedPath({}, 'y')).toBe(false);
  });

  it('toHmSignalPath converts .get. paths', () => {
    expect(toHmSignalPath('diagnostics.get.battery_voltage')).toBe('diagnostics.battery_voltage');
  });

  it('resolveHmSignalEntry reads nested MQTT V2 diagnostics array', () => {
    const payload = {
      version: 2,
      vin: 'WDD2050861F664088',
      data: {
        diagnostics: {
          tire_pressures: [
            {
              data: {
                front_left: { value: 2.3, unit: 'bar' },
                front_right: { value: 2.2, unit: 'bar' },
              },
              timestamp: '2026-04-14T15:33:27.000Z',
            },
          ],
        },
      },
    };

    const entry = resolveHmSignalEntry(payload, 'diagnostics.get.tire_pressures');
    expect(entry).toBeDefined();
    expect(Array.isArray(entry)).toBe(true);
  });

  it('extractHmSignalData/value supports sample arrays with data.value', () => {
    const entry = [
      {
        data: { unit: 'volts', value: 14.7 },
        timestamp: '2026-04-14T16:11:19.000Z',
      },
    ];

    expect(extractHmSignalData(entry)).toEqual({ unit: 'volts', value: 14.7 });
    expect(extractHmSignalValue(entry)).toBe(14.7);
  });
});

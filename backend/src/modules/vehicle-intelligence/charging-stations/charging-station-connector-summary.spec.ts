import {
  deriveStationMaxOutputKw,
  parsePowerKwValues,
  parseSinglePowerKw,
  summarizeConnectorsFromTags,
} from './charging-station-connector-summary';

describe('charging-station-connector-summary', () => {
  it('C1 type2 count', () => {
    const connectors = summarizeConnectorsFromTags({ 'socket:type2': '4', amenity: 'charging_station' });
    expect(connectors).toEqual([{ type: 'type2', count: 4, maxOutputKw: undefined }]);
  });

  it('C2 CCS output normalized', () => {
    const connectors = summarizeConnectorsFromTags({
      'socket:type2_combo': '6',
      'socket:type2_combo:output': '350 kW',
    });
    expect(connectors[0]).toMatchObject({ type: 'type2_combo', count: 6, maxOutputKw: 350 });
  });

  it('C3 multi-output parsed conservatively', () => {
    expect(parsePowerKwValues('350 kW;90 kW')).toEqual([350, 90]);
    expect(parseSinglePowerKw('350 kW;90 kW')).toBe(350);
  });

  it('C4 malformed power not invented', () => {
    expect(parseSinglePowerKw('fast')).toBeUndefined();
  });

  it('C5 unknown socket preserved in tags map', () => {
    const tags = { 'socket:future_plug': '1' };
    expect(summarizeConnectorsFromTags(tags)[0].type).toBe('future_plug');
    expect(tags['socket:future_plug']).toBe('1');
  });

  it('C6 capacity absent not zero in connector summary', () => {
    const connectors = summarizeConnectorsFromTags({ 'socket:type2': '2' });
    expect(connectors[0].count).toBe(2);
  });

  it('C7 fee absent stays unknown at station level', () => {
    expect(summarizeConnectorsFromTags({ amenity: 'charging_station' })).toEqual([]);
  });

  it('C8 private access preserved via station fields not connector parser', () => {
    const maxKw = deriveStationMaxOutputKw([], { access: 'private' });
    expect(maxKw).toBeUndefined();
  });
});

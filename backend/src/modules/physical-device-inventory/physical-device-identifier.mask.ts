export function maskDeviceSerial(serial: string | null | undefined): string | null {
  if (!serial?.trim()) return null;
  const s = serial.trim();
  if (s.length <= 6) return '***';
  if (s.length <= 10) return `${s.slice(0, 2)}***${s.slice(-2)}`;
  return `${s.slice(0, 4)}***${s.slice(-4)}`;
}

export function maskDeviceImei(imei: string | null | undefined): string | null {
  if (!imei?.trim()) return null;
  const digits = imei.replace(/\D/g, '');
  if (digits.length < 8) return '***';
  return `${digits.slice(0, 4)}******${digits.slice(-3)}`;
}

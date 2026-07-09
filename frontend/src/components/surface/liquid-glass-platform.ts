/** Safari / iOS — live DOM bending is unreliable; prefer frost/tint over strong optics. */
export function prefersSafariSoftLens(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari =
    isIOS ||
    (/Safari/i.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua));
  return isSafari;
}

import { useEffect, useState } from 'react';
import {
  readOperatorDeviceCapabilitiesFromWindow,
  type OperatorDeviceCapabilities,
} from '../lib/operatorDeviceCapabilities';

const MEDIA_QUERIES = [
  '(pointer: coarse)',
  '(pointer: fine)',
  '(hover: hover)',
  '(any-pointer: coarse)',
  '(any-pointer: fine)',
  '(any-hover: hover)',
] as const;

function readCapabilities(): OperatorDeviceCapabilities {
  if (typeof window === 'undefined') {
    return readOperatorDeviceCapabilitiesFromWindow({
      innerWidth: 390,
      innerHeight: 844,
      devicePixelRatio: 2,
      matchMedia: () => ({ matches: false }),
      navigator: { maxTouchPoints: 1, mediaDevices: { getUserMedia: () => Promise.resolve({} as MediaStream) } },
      isSecureContext: true,
      ontouchstart: null,
    } as unknown as Window & typeof globalThis);
  }
  return readOperatorDeviceCapabilitiesFromWindow(window);
}

export function useOperatorDeviceCapabilities(): OperatorDeviceCapabilities {
  const [capabilities, setCapabilities] = useState(readCapabilities);

  useEffect(() => {
    const update = () => setCapabilities(readCapabilities());
    const mediaLists = MEDIA_QUERIES.map((q) => window.matchMedia(q));
    mediaLists.forEach((mq) => mq.addEventListener('change', update));
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      mediaLists.forEach((mq) => mq.removeEventListener('change', update));
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return capabilities;
}

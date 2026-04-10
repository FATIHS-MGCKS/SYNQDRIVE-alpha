import { useState, useEffect } from 'react';
import { resolveAddress, type ResolvedAddress } from './addressService';

export function useAddress(
  lat: number | null | undefined,
  lng: number | null | undefined,
): { address: ResolvedAddress | null; loading: boolean } {
  const [address, setAddress] = useState<ResolvedAddress | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (lat == null || lng == null || (lat === 0 && lng === 0)) {
      setAddress(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    resolveAddress(lat, lng).then((result) => {
      if (!cancelled) {
        setAddress(result);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [lat, lng]);

  return { address, loading };
}

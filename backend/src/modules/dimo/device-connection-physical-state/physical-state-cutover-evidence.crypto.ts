import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { PHYSICAL_STATE_CUTOVER_EVIDENCE_ALGORITHM } from './physical-state-cutover-evidence.types';

export type Ed25519KeyMaterial = {
  keyId: string;
  algorithm: typeof PHYSICAL_STATE_CUTOVER_EVIDENCE_ALGORITHM;
  publicKeyPem: string;
  privateKeyPem?: string;
};

export function generateTestEd25519KeyPair(keyId: string): Ed25519KeyMaterial {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    keyId,
    algorithm: PHYSICAL_STATE_CUTOVER_EVIDENCE_ALGORITHM,
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

export function signEd25519Payload(
  canonicalPayloadBytes: Buffer,
  privateKeyPem: string,
): string {
  const privateKey = createPrivateKey(privateKeyPem);
  const signature = sign(null, canonicalPayloadBytes, privateKey);
  return signature.toString('base64');
}

export function verifyEd25519Payload(
  canonicalPayloadBytes: Buffer,
  signatureBase64: string,
  publicKeyPem: string,
): boolean {
  try {
    const signature = Buffer.from(signatureBase64, 'base64');
    if (signature.length === 0) {
      return false;
    }
    const publicKey = createPublicKey(publicKeyPem);
    return verify(null, canonicalPayloadBytes, publicKey, signature);
  } catch {
    return false;
  }
}

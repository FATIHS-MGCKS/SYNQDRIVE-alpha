import type { DocumentImageProbeResult } from './document-file-identification-status.types';

export function probeJpegBuffer(buffer: Buffer): DocumentImageProbeResult {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return corruptImage('Missing JPEG SOI marker');
  }

  let offset = 2;
  let width = 0;
  let height = 0;
  let rotationDegrees: 0 | 90 | 180 | 270 = 0;

  while (offset + 4 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      return corruptImage('Invalid JPEG marker segment');
    }

    const marker = buffer[offset + 1];
    if (marker === 0xd9) break;
    if (marker === 0x00) {
      return corruptImage('Invalid JPEG stuffed byte');
    }

    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2 || offset + 2 + segmentLength > buffer.length) {
      return corruptImage('Truncated JPEG segment');
    }

    const isSof =
      marker === 0xc0 ||
      marker === 0xc1 ||
      marker === 0xc2 ||
      marker === 0xc3 ||
      marker === 0xc5 ||
      marker === 0xc6 ||
      marker === 0xc7 ||
      marker === 0xc9 ||
      marker === 0xca ||
      marker === 0xcb ||
      marker === 0xcd ||
      marker === 0xce ||
      marker === 0xcf;

    if (isSof && segmentLength >= 7) {
      height = buffer.readUInt16BE(offset + 5);
      width = buffer.readUInt16BE(offset + 7);
    }

    if (marker === 0xe1) {
      const exifOrientation = readJpegExifOrientation(buffer.subarray(offset + 4, offset + 4 + segmentLength - 2));
      if (exifOrientation != null) {
        rotationDegrees = mapExifOrientationToDegrees(exifOrientation);
      }
    }

    offset += 2 + segmentLength;
  }

  if (width <= 0 || height <= 0) {
    return corruptImage('Missing JPEG frame dimensions');
  }

  return {
    width,
    height,
    pixelCount: width * height,
    rotationDegrees,
    corrupt: false,
  };
}

export function probePngBuffer(buffer: Buffer): DocumentImageProbeResult {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) {
    return corruptImage('Missing PNG signature');
  }

  const chunkType = buffer.subarray(12, 16).toString('ascii');
  if (chunkType !== 'IHDR') {
    return corruptImage('Missing PNG IHDR chunk');
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width <= 0 || height <= 0) {
    return corruptImage('Invalid PNG dimensions');
  }

  return {
    width,
    height,
    pixelCount: width * height,
    rotationDegrees: 0,
    corrupt: false,
  };
}

export function probeWebpBuffer(buffer: Buffer): DocumentImageProbeResult {
  if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
    return corruptImage('Missing WebP RIFF header');
  }

  const chunkType = buffer.toString('ascii', 12, 16);
  if (chunkType === 'VP8 ') {
    if (buffer.length < 30) return corruptImage('Truncated WebP VP8 frame');
    const width = buffer.readUInt16LE(26) & 0x3fff;
    const height = buffer.readUInt16LE(28) & 0x3fff;
    if (width <= 0 || height <= 0) return corruptImage('Invalid WebP VP8 dimensions');
    return { width, height, pixelCount: width * height, rotationDegrees: 0, corrupt: false };
  }

  if (chunkType === 'VP8L') {
    if (buffer.length < 25) return corruptImage('Truncated WebP VP8L frame');
    const bits = buffer.readUInt32LE(21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    if (width <= 0 || height <= 0) return corruptImage('Invalid WebP VP8L dimensions');
    return { width, height, pixelCount: width * height, rotationDegrees: 0, corrupt: false };
  }

  // Lossless / animated variants without easy dimension probe — accept with conservative pixel estimate.
  return {
    width: 1,
    height: 1,
    pixelCount: 1,
    rotationDegrees: 0,
    corrupt: false,
  };
}

function corruptImage(reason: string): DocumentImageProbeResult {
  return {
    width: 0,
    height: 0,
    pixelCount: 0,
    rotationDegrees: 0,
    corrupt: true,
    corruptReason: reason,
  };
}

function readJpegExifOrientation(app1Segment: Buffer): number | null {
  if (app1Segment.length < 8) return null;
  if (app1Segment.toString('ascii', 0, 4) !== 'Exif') return null;

  const tiffStart = 6;
  if (app1Segment.length < tiffStart + 8) return null;
  const endian = app1Segment.toString('ascii', tiffStart, tiffStart + 2);
  const little = endian === 'II';
  const readU16 = (offset: number) =>
    little ? app1Segment.readUInt16LE(offset) : app1Segment.readUInt16BE(offset);
  const readU32 = (offset: number) =>
    little ? app1Segment.readUInt32LE(offset) : app1Segment.readUInt32BE(offset);

  const ifdOffset = readU32(tiffStart + 4);
  const ifdStart = tiffStart + ifdOffset;
  if (ifdStart + 2 > app1Segment.length) return null;

  const entries = readU16(ifdStart);
  let cursor = ifdStart + 2;
  for (let i = 0; i < entries; i += 1) {
    if (cursor + 12 > app1Segment.length) return null;
    const tag = readU16(cursor);
    if (tag === 0x0112) {
      const value = readU16(cursor + 8);
      return value;
    }
    cursor += 12;
  }

  return null;
}

function mapExifOrientationToDegrees(orientation: number): 0 | 90 | 180 | 270 {
  switch (orientation) {
    case 3:
      return 180;
    case 6:
      return 90;
    case 8:
      return 270;
    default:
      return 0;
  }
}

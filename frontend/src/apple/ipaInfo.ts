import { strFromU8, unzipSync } from 'fflate';
import { parsePlist } from './plist';

interface ParsedIpaInfo {
  bundleId?: string;
  displayName?: string;
}

const PRIMARY_APP_INFO_PLIST_RE = /^Payload\/[^/]+\.app\/Info\.plist$/;

function isPrimaryAppInfoPlistEntry(name: string): boolean {
  return PRIMARY_APP_INFO_PLIST_RE.test(name);
}

function readUInt(bytes: Uint8Array, offset: number, length: number): number {
  let value = 0;
  for (let i = 0; i < length; i += 1) {
    value = value * 256 + bytes[offset + i];
  }
  return value;
}

function decodeUtf16Be(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    text += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
  }
  return text;
}

function parseBinaryPlist(bytes: Uint8Array): unknown {
  if (bytes.length < 40) {
    throw new Error('Invalid binary plist');
  }

  if (strFromU8(bytes.subarray(0, 8)) !== 'bplist00') {
    throw new Error('Unsupported plist format');
  }

  const trailerOffset = bytes.length - 32;
  const offsetSize = bytes[trailerOffset + 6];
  const objectRefSize = bytes[trailerOffset + 7];
  const objectCount = readUInt(bytes, trailerOffset + 8, 8);
  const topObject = readUInt(bytes, trailerOffset + 16, 8);
  const offsetTableStart = readUInt(bytes, trailerOffset + 24, 8);

  if (objectCount <= 0 || topObject >= objectCount) {
    throw new Error('Invalid binary plist object table');
  }

  const objectOffsets = new Array<number>(objectCount);
  for (let i = 0; i < objectCount; i += 1) {
    const entryOffset = offsetTableStart + i * offsetSize;
    objectOffsets[i] = readUInt(bytes, entryOffset, offsetSize);
  }

  const memo = new Map<number, unknown>();

  function readLength(offset: number, objectInfo: number): { length: number; nextOffset: number } {
    if (objectInfo < 0x0f) {
      return { length: objectInfo, nextOffset: offset + 1 };
    }

    const marker = bytes[offset + 1];
    const markerType = marker >> 4;
    const markerInfo = marker & 0x0f;
    if (markerType !== 0x1) {
      throw new Error('Invalid binary plist length marker');
    }

    const intSize = 1 << markerInfo;
    const intOffset = offset + 2;
    return {
      length: readUInt(bytes, intOffset, intSize),
      nextOffset: intOffset + intSize,
    };
  }

  function parseObject(index: number): unknown {
    if (memo.has(index)) {
      return memo.get(index);
    }

    const offset = objectOffsets[index];
    const marker = bytes[offset];
    const objectType = marker >> 4;
    const objectInfo = marker & 0x0f;

    let value: unknown;

    if (objectType === 0x0) {
      if (objectInfo === 0x8) {
        value = false;
      } else if (objectInfo === 0x9) {
        value = true;
      } else {
        value = null;
      }
    } else if (objectType === 0x1) {
      const intSize = 1 << objectInfo;
      value = readUInt(bytes, offset + 1, intSize);
    } else if (objectType === 0x2) {
      const realSize = 1 << objectInfo;
      const view = new DataView(bytes.buffer, bytes.byteOffset + offset + 1, realSize);
      if (realSize === 4) {
        value = view.getFloat32(0, false);
      } else if (realSize === 8) {
        value = view.getFloat64(0, false);
      } else {
        throw new Error('Unsupported binary plist float size');
      }
    } else if (objectType === 0x5) {
      const { length, nextOffset } = readLength(offset, objectInfo);
      value = strFromU8(bytes.subarray(nextOffset, nextOffset + length));
    } else if (objectType === 0x6) {
      const { length, nextOffset } = readLength(offset, objectInfo);
      const byteLength = length * 2;
      value = decodeUtf16Be(bytes.subarray(nextOffset, nextOffset + byteLength));
    } else if (objectType === 0xa) {
      const { length, nextOffset } = readLength(offset, objectInfo);
      const values: unknown[] = [];
      for (let i = 0; i < length; i += 1) {
        const ref = readUInt(bytes, nextOffset + i * objectRefSize, objectRefSize);
        values.push(parseObject(ref));
      }
      value = values;
    } else if (objectType === 0xd) {
      const { length, nextOffset } = readLength(offset, objectInfo);
      const dict: Record<string, unknown> = {};
      const valuesOffset = nextOffset + length * objectRefSize;
      for (let i = 0; i < length; i += 1) {
        const keyRef = readUInt(bytes, nextOffset + i * objectRefSize, objectRefSize);
        const valueRef = readUInt(bytes, valuesOffset + i * objectRefSize, objectRefSize);
        const key = parseObject(keyRef);
        if (typeof key === 'string') {
          dict[key] = parseObject(valueRef);
        }
      }
      value = dict;
    } else {
      throw new Error(`Unsupported binary plist object type: ${objectType}`);
    }

    memo.set(index, value);
    return value;
  }

  return parseObject(topObject);
}

function parseInfoPlist(infoPlistBytes: Uint8Array): ParsedIpaInfo {
  const plistData = (() => {
    if (strFromU8(infoPlistBytes.subarray(0, 8)) === 'bplist00') {
      return parseBinaryPlist(infoPlistBytes);
    }

    const xml = strFromU8(infoPlistBytes);
    return parsePlist(xml);
  })();

  if (!plistData || typeof plistData !== 'object' || Array.isArray(plistData)) {
    throw new Error('Invalid Info.plist content');
  }

  const data = plistData as Record<string, unknown>;
  const bundleId = typeof data.CFBundleIdentifier === 'string' ? data.CFBundleIdentifier : undefined;
  const displayName =
    typeof data.CFBundleDisplayName === 'string'
      ? data.CFBundleDisplayName
      : typeof data.CFBundleName === 'string'
        ? data.CFBundleName
        : undefined;

  return { bundleId, displayName };
}

export function readIpaInfo(ipaBytes: Uint8Array): ParsedIpaInfo {
  const files = unzipSync(ipaBytes, {
    filter: (file) => isPrimaryAppInfoPlistEntry(file.name),
  });
  const infoPlistName = Object.keys(files).find((name) => isPrimaryAppInfoPlistEntry(name));
  if (!infoPlistName) {
    throw new Error('Primary app Info.plist not found in IPA');
  }

  return parseInfoPlist(files[infoPlistName]);
}

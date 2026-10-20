export type Bytes = Uint8Array<ArrayBuffer>;

export function concat(...parts: Uint8Array[]): Bytes {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

export function be32(value: number): Bytes {
  return new Uint8Array([value >>> 24, value >>> 16, value >>> 8, value]);
}

export function read32(bytes: Uint8Array, offset: number, littleEndian = false): number {
  if (offset < 0 || offset + 4 > bytes.length) throw new Error('Truncated SAP record');
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, littleEndian);
}

export function fromBase64(value: string): Bytes {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export async function digest(algorithm: 'SHA-1' | 'SHA-256', bytes: Bytes): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.digest(algorithm, bytes));
}

export function xor(left: Uint8Array, right: Uint8Array): Bytes {
  if (left.length !== right.length) throw new Error('Mismatched SAP blocks');
  return left.map((value, index) => value ^ right[index]) as Bytes;
}

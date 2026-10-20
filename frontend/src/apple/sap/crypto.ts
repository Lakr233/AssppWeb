import { be32, concat, digest, xor } from './bytes';
import type { Bytes } from './bytes';

interface DERNode {
  tag: number;
  start: number;
  end: number;
}

function der(bytes: Bytes, at: number, limit = bytes.length): DERNode {
  const tag = bytes[at++];
  let length = bytes[at++];
  if (length & 0x80) {
    const count = length & 0x7f;
    if (count < 1 || count > 4 || at + count > limit) throw new Error('Invalid SAP certificate length');
    length = 0;
    for (let index = 0; index < count; index++) length = length * 256 + bytes[at++];
  }
  if (at > limit || !Number.isInteger(length) || at + length > limit) throw new Error('Truncated SAP certificate');
  return { tag, start: at, end: at + length };
}

function children(bytes: Bytes, node: DERNode): DERNode[] {
  const result: DERNode[] = [];
  for (let at = node.start; at < node.end; ) {
    const child = der(bytes, at, node.end);
    result.push(child);
    at = child.end;
  }
  return result;
}

function integer(bytes: Bytes, node: DERNode): Bytes {
  if (node.tag !== 2 || node.start === node.end || bytes[node.start] & 0x80) throw new Error('Invalid SAP RSA integer');
  let start = node.start;
  while (start + 1 < node.end && bytes[start] === 0) start++;
  return bytes.slice(start, node.end);
}

export function readCertificate(bytes: Bytes): { serial: Bytes; modulus: Bytes; exponent: Bytes } {
  if (bytes.length < 512 || bytes.length > 1048576) throw new Error('Invalid SAP certificate container');
  let selected: ReturnType<typeof readCertificate> | undefined;
  let selectedEnd = 0;
  for (let at = 0; at < bytes.length - 4; at++) {
    if (bytes[at] !== 0x30) continue;
    try {
      const root = der(bytes, at);
      if (root.end <= selectedEnd || root.end - at < 512) continue;
      const certificate = children(bytes, root);
      if (
        certificate.length !== 3 ||
        certificate[0].tag !== 0x30 ||
        certificate[1].tag !== 0x30 ||
        certificate[2].tag !== 3
      )
        continue;
      const fields = children(bytes, certificate[0]);
      const version = fields[0].tag === 0xa0 ? 1 : 0;
      const serial = integer(bytes, fields[version]);
      const publicKey = children(bytes, fields[version + 5]);
      const algorithm = children(bytes, publicKey[0]);
      const oid = bytes.slice(algorithm[0].start, algorithm[0].end);
      if (
        algorithm[0].tag !== 6 ||
        Array.from(oid).join(',') !== '42,134,72,134,247,13,1,1,1' ||
        publicKey[1].tag !== 3 ||
        bytes[publicKey[1].start] !== 0
      )
        continue;
      const key = children(bytes, der(bytes, publicKey[1].start + 1, publicKey[1].end));
      if (key.length !== 2) continue;
      const modulus = integer(bytes, key[0]);
      const exponent = integer(bytes, key[1]);
      if (
        serial.length > 127 ||
        modulus.length !== 256 ||
        modulus[0] < 128 ||
        bigint(exponent) < 3n ||
        !(exponent[exponent.length - 1] & 1)
      )
        continue;
      const wireSerial = serial[0] & 0x80 ? concat(Uint8Array.of(0), serial) : serial;
      if (wireSerial.length > 127) continue;
      selected = { serial: wireSerial, modulus, exponent };
      selectedEnd = root.end;
    } catch {
      // The service container also contains non-certificate DER sequences.
    }
  }
  if (!selected) throw new Error('SAP container has no RSA-2048 certificate');
  return selected;
}

function bigint(bytes: Bytes): bigint {
  return bytes.reduce((value, byte) => (value << 8n) | BigInt(byte), 0n);
}

export async function rsaOAEP(message: Bytes, seed: Bytes, modulus: Bytes, exponent: Bytes): Promise<Bytes> {
  if (message.length > 214 || seed.length !== 20 || modulus.length !== 256) throw new Error('Invalid SAP RSA inputs');
  async function mask(input: Bytes, count: number): Promise<Bytes> {
    const parts: Bytes[] = [];
    for (let index = 0; index < Math.ceil(count / 20); index++)
      parts.push(await digest('SHA-1', concat(input, be32(index))));
    return concat(...parts).slice(0, count);
  }
  const database = concat(
    await digest('SHA-1', new Uint8Array()),
    new Uint8Array(214 - message.length),
    Uint8Array.of(1),
    message,
  );
  const maskedDatabase = xor(database, await mask(seed, 235));
  const encoded = concat(Uint8Array.of(0), xor(seed, await mask(maskedDatabase, 20)), maskedDatabase);
  const n = bigint(modulus);
  let base = bigint(encoded);
  let power = bigint(exponent);
  let result = 1n;
  if (base >= n || power < 3n || !(power & 1n)) throw new Error('Invalid SAP RSA key');
  while (power) {
    if (power & 1n) result = (result * base) % n;
    base = (base * base) % n;
    power >>= 1n;
  }
  const output = new Uint8Array(256);
  for (let index = 255; index >= 0; index--) {
    output[index] = Number(result & 255n);
    result >>= 8n;
  }
  return output;
}

// SAP uses whole CBC blocks without PKCS#7 padding. Web Crypto always pads:
// discard its final encryption block; append a valid padding block to decrypt.
export async function cbc(bytes: Bytes, keyBytes: Bytes, iv: Bytes, encrypt: boolean): Promise<Bytes> {
  if (keyBytes.length !== 16 || iv.length !== 16 || !bytes.length || bytes.length % 16 || bytes.length > 1048576)
    throw new Error('Invalid SAP AES blocks');
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-CBC', false, ['encrypt', 'decrypt']);
  if (encrypt)
    return new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, bytes)).slice(0, bytes.length);
  const padding = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-CBC', iv: bytes.slice(-16) }, key, new Uint8Array()),
  );
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, concat(bytes, padding)));
}

export async function hmac(keyBytes: Bytes, message: Bytes): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, message));
}

import { be32, concat, read32 } from './bytes';
import { cbc, hmac, readCertificate, rsaOAEP } from './crypto';
import { SAPRandom } from './random';
import { data } from './tables';
import type { Bytes } from './bytes';

export interface SAPSession {
  source: Bytes;
  f2Input1: Bytes;
  f2Input2: Bytes;
  f2Tail: Bytes;
  f3: Bytes;
  random: SAPRandom;
  seed30: number;
  seed54: number;
  f1Address: number;
  ivAddress: number;
}

export async function createHandshake(certificate: Bytes, entropy?: number[], seconds?: number, microseconds?: number) {
  const now = Date.now();
  entropy ??= Array.from(crypto.getRandomValues(new Uint32Array(3)));
  seconds ??= Math.floor(now / 1000);
  microseconds ??= (now % 1000) * 1000;
  const publicKey = readCertificate(certificate);
  const random = new SAPRandom();
  const pool = random.initialize(entropy, seconds, microseconds);
  const seed30 = pool[12];
  const seed54 = pool[21];
  const generate = (count: number, address: number, exchange = false) =>
    random.fill(
      exchange ? pool[15] : seed54,
      address,
      exchange ? data.EXCHANGE_WHITEN : data.IV_WHITEN,
      exchange ? 0x4b : 0x12,
      count,
    );
  const initial = generate(33, 0x7ffac0);
  const material = initial.slice(0, 16 + (initial[32] % 17)).map((value) => value ^ 0x2d);
  const responseKey = generate(16, 0x7ffc14, true);
  const responseEcho = generate(16, 0x7ffc14, true);
  const encryptionKey = generate(16, 0x7ffc14, true);
  const iv = generate(16, 0x7ffc14, true);
  const authenticationKey = generate(20, 0x7ffc24, true);
  const padding = Uint8Array.from({ length: 11 }, (_, index) => {
    const value = 0x7ff812 - index;
    return Math.imul(value ^ 0xba, value + 0x11) ^ 0x2d;
  });
  const plaintext = concat(Uint8Array.of(2), be32(1), responseKey, responseEcho, padding);
  const keyBlock = await rsaOAEP(
    concat(encryptionKey, authenticationKey),
    generate(20, 0x7ff4e4),
    publicKey.modulus,
    publicKey.exponent,
  );
  const encrypted = await cbc(plaintext, encryptionKey, iv, true);
  const request = concat(
    Uint8Array.of(1, publicKey.serial.length),
    publicKey.serial,
    keyBlock,
    iv,
    be32(encrypted.length),
    encrypted,
    await hmac(authenticationKey, encrypted),
  );

  return {
    request,
    async complete(reply: Bytes): Promise<SAPSession> {
      if (reply.length < 21 || reply.length > 1048576 || reply[0] !== 2) throw new Error('Invalid SAP setup response');
      const length = read32(reply, 17);
      if (!length || length % 16 || length > reply.length - 21 - 25)
        throw new Error('Invalid SAP setup ciphertext length');
      const recordOffset = 21 + length;
      const recordLength = (read32(reply, recordOffset + 21) + 25) >>> 0;
      if (recordLength > 16 * 1024 * 1024 || recordLength > reply.length - recordOffset)
        throw new Error('Invalid SAP signature record');
      const plaintext = await cbc(reply.slice(21, recordOffset), responseKey, reply.slice(1, 17), false);
      let offset = 0;
      const fields = [16, 16, 16, 576, 576, 16].map((expected) => {
        const count = read32(plaintext, offset);
        offset += 4;
        if (count !== expected || count > plaintext.length - offset) throw new Error('Invalid decrypted SAP field');
        const field = plaintext.slice(offset, offset + count);
        offset += count;
        return field;
      });
      let difference = 0;
      for (let index = 0; index < 16; index++) difference |= fields[5][index] ^ responseEcho[index];
      if (difference) throw new Error('SAP reply belongs to another exchange');
      return {
        source: fields[4],
        f2Input1: fields[2].map((value) => value + 0x2d),
        f2Input2: material.slice(0, 16),
        f2Tail: material.slice(16).map((value) => value ^ 0x2d),
        f3: reply.slice(recordOffset, recordOffset + recordLength),
        random,
        seed30,
        seed54,
        f1Address: 0x604 + (material.length > 28 ? 16 : 0),
        ivAddress: 0x7fed90,
      };
    },
  };
}

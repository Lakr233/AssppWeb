import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from './fixtures/sap-handshake.json';
import { concat, digest } from '../../src/apple/sap/bytes';
import { createCipher } from '../../src/apple/sap/cipher';
import { deriveF2 } from '../../src/apple/sap/f2';
import { createHandshake } from '../../src/apple/sap/handshake';
import { SAPRandom } from '../../src/apple/sap/random';
import { createSigner } from '../../src/apple/sap/signer';
import { loadTables } from '../../src/apple/sap/tables';
import type { SAPSession } from '../../src/apple/sap/handshake';

const unhex = (value: string) => Uint8Array.from(value.match(/../g) ?? [], (byte) => parseInt(byte, 16));
const hex = (value: Uint8Array) => Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');

beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => vi.unstubAllGlobals());

describe('SAP compatibility with ApplePackage', () => {
  it.each(fixture.cases)('matches the complete independent handshake vector: $name', async (vector) => {
    const handshake = await createHandshake(
      unhex(fixture.certificate),
      vector.entropy,
      vector.seconds,
      vector.microseconds,
    );
    expect(hex(handshake.request)).toBe(vector.request);
    const session = await handshake.complete(unhex(vector.reply));
    const words = new Uint8Array(624 * 4);
    const view = new DataView(words.buffer);
    session.random.words.forEach((word, index) => view.setUint32(index * 4, word, true));
    expect(hex(await digest('SHA-256', words))).toBe(vector.randomHash);
    expect(session.random.cursor).toBe(vector.cursor);
    expect(session.seed30).toBe(vector.seed30);
    expect(session.seed54).toBe(vector.seed54);
    expect(hex(session.f2Input2)).toBe(vector.f2Input2);
    expect(hex(session.f2Tail)).toBe(vector.f2Tail);
    expect(session.source).toEqual(Uint8Array.from({ length: 576 }, (_, index) => index * 17 + 3));
    expect(session.f3.length).toBe(159);
  });

  it('rejects truncated and unrelated setup replies', async () => {
    const vector = fixture.cases[0];
    const handshake = await createHandshake(
      unhex(fixture.certificate),
      vector.entropy,
      vector.seconds,
      vector.microseconds,
    );
    const reply = unhex(vector.reply);
    for (const count of [0, 20, 21, reply.length - 1])
      await expect(handshake.complete(reply.slice(0, count))).rejects.toThrow();
    await expect(handshake.complete(unhex(fixture.cases[1].reply))).rejects.toThrow();
  });

  it('matches F2, block encryption and three consecutive complete signatures', async () => {
    let state = 0x53595031;
    const word = () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return state >>> 0;
    };
    const bytes = (length: number) => Uint8Array.from({ length }, () => word());
    const source = bytes(576);
    source[0xfa] = source[0xca] ^ 10;
    source[0xf3] = source[0xc3] ^ 147;
    const f2Input1 = bytes(16);
    const f2Input2 = bytes(16);
    const f2Tail = bytes(7);
    const label = new TextEncoder().encode('SYNTHETIC TEST SESSION / NEVER SERVER-ISSUED / ');
    const f3 = concat(label, bytes(159 - label.length));
    const random = new SAPRandom(Uint32Array.from({ length: 624 }, word), 624);
    const session: SAPSession = {
      source,
      f2Input1,
      f2Input2,
      f2Tail,
      f3,
      random,
      seed30: word(),
      seed54: word(),
      f1Address: 0x34500044,
      ivAddress: 0xeed00050,
    };
    const tables = await loadTables();
    expect(hex(deriveF2(f2Input1, f2Input2, tables))).toBe('ad1adda4bad5ada37fd54543681d001c');
    const encrypt = createCipher(source, tables);
    const blocks = [
      new Uint8Array(16),
      Uint8Array.from({ length: 16 }, (_, index) => index),
      new Uint8Array(16).fill(255),
    ];
    const expectedBlocks = [
      '8fcdc9e6d7c5009c7f489288231582de',
      '65810b6c7555809e4b87529110631a4c',
      '73d2bd4f671e9abe8b105aac1883036d',
    ];
    blocks.forEach((block, index) => expect(hex(encrypt(block))).toBe(expectedBlocks[index]));
    const signer = await createSigner(session, 7);
    const bodies = [
      new Uint8Array(),
      concat(new TextEncoder().encode('synthetic SAP\nbody-2'), Uint8Array.of(0, 255)),
      Uint8Array.from({ length: 256 }, (_, index) => index),
    ];
    const expected = [
      'ba76e674c73d9db75c2986233016b94b22e062556fd029d71733726519756517',
      '4acc6269de932c753260fecfa375a6405b5b63cf621a8adace3bd7b5f0305287',
      '853914149c9de004852fffa75a4489c3cdec3f179c92903e3d94b8b2d494e4e4',
    ];
    for (let index = 0; index < bodies.length; index++) {
      const signature = await signer.sign(bodies[index]);
      expect(signature.length).toBe(501);
      expect(hex(await digest('SHA-256', signature))).toBe(expected[index]);
    }
  });
});

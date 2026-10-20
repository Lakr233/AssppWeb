// Port of ApplePackage's repository-authored rng_f1.c. All arithmetic wraps at 32 bits.
import { concat } from './bytes';
import { data } from './tables';
import type { Bytes } from './bytes';

export class SAPRandom {
  constructor(
    public words = new Uint32Array(624),
    public cursor = 0,
  ) {}

  word(): number {
    for (let index = 0; index < 624; index++) {
      const value = (this.words[index] & 0x80000000) | (this.words[(index + 1) % 624] & 0x7fffffff);
      this.words[index] = this.words[(index + 397) % 624] ^ (value >>> 1) ^ (value & 1 ? 0x9908b0df : 0);
    }
    if (this.cursor >= 624) this.cursor = 0;
    let value = this.words[this.cursor++];
    value ^= value >>> 11;
    value ^= (value << 7) & 0x9d2c5680;
    value ^= (value << 15) & 0xefc60000;
    return (value ^ (value >>> 18)) >>> 0;
  }

  fill(seed: number, address: number, table: number[], mask: number, count: number): Bytes {
    const output = new Uint8Array(count);
    let remaining = count;
    while (remaining) {
      const word = this.word();
      for (let shift = 0; shift < 32 && remaining; shift += 8) {
        let hash = (seed ^ (address + remaining - 1)) & 0x7fffffff;
        hash = Math.imul(hash, 0x84edb2eb) >>> 0;
        hash ^= hash >>> 16;
        hash = Math.imul(hash, 0x84edb2eb) >>> 0;
        const value = ((word >>> shift) ^ hash ^ table[hash >>> 24] ^ mask) & 255;
        output[remaining - 1] = value;
        if (value) remaining--;
      }
    }
    return output;
  }

  initialize(entropy: number[], seconds: number, microseconds: number): Uint32Array {
    if (entropy.length !== 3 || microseconds < 0 || microseconds >= 1000000)
      throw new Error('Invalid SAP entropy or time');
    const keys = new Uint32Array([entropy[2], microseconds, seconds, entropy[1]]);
    this.words[0] = entropy[0];
    for (let index = 1; index < 624; index++) {
      const previous = this.words[index - 1];
      this.words[index] = Math.imul(1812433253, previous ^ (previous >>> 30)) + index;
    }
    let index = 1;
    let key = 0;
    for (let step = 0; step < 624; step++) {
      const previous = this.words[index - 1];
      this.words[index] = (this.words[index] ^ Math.imul(previous ^ (previous >>> 30), 1664525)) + keys[key] + key;
      if (++index === 624) {
        this.words[0] = this.words[623];
        index = 1;
      }
      if (++key === 4) {
        keys[0] ^= 0x200;
        key = 0;
      } else {
        keys[key] ^= 0x201;
      }
    }
    for (let step = 0; step < 623; step++) {
      const previous = this.words[index - 1];
      this.words[index] = (this.words[index] ^ Math.imul(previous ^ (previous >>> 30), 1566083941)) - index;
      if (++index === 624) {
        this.words[0] = this.words[623];
        index = 1;
      }
    }
    this.words[0] = 0x80000000;
    this.cursor = 0;
    const pool = Uint32Array.from({ length: 128 }, () => this.word());
    for (let step = 0; step < 64; step += 4) pool[step] |= ~pool[pool[step] & 62] << 16;
    this.fill(pool[12], 0x7ff9b0, data.INITIALIZE_WHITEN, 0x35, 1024);
    return pool;
  }

  f1(seed: number, address: number): Bytes {
    const material = concat(
      this.fill(seed, address, data.F1_WHITEN, 0x27, 60),
      this.fill(seed, address + 0xaa, data.F1_WHITEN, 0x27, 18),
    );
    const pre = Uint8Array.from(data.F1_TEMPLATE);
    pre.set(material.subarray(0, 60), 68);
    pre.set(material.subarray(60), 238);
    const output = new Uint8Array(256);
    for (let half = 0; half < 2; half++) {
      let low = pre.slice(half * 128, half * 128 + 64);
      let high = pre.slice(half * 128 + 64, half * 128 + 128);
      for (let round = 0; round < 7; round++) {
        const state = concat(high, Uint8Array.from(data.F1_RC));
        for (let index = 0; index < 80; index++) state[index] = (state[index] ^ 0x2d) + index;
        for (let index = 0; index < 80; index++) state[index] = data.F1_G[0][state[index]] + 0x25 + index;
        for (const constant of [0x5d, 0xae, 0xff, 0x50]) {
          for (let index = 0; index < 80; index++)
            state[index] ^=
              (constant + index + data.F1_G[1][state[(index + 75) % 80]] + data.F1_G[2][state[(index + 55) % 80]]) &
              255;
        }
        for (let index = 0; index < 80; index++) state[index] = data.F1_G[3][state[index]] + 0xc4 + index;
        const next = low.map((byte, index) => byte ^ state[index]);
        low = high;
        high = next;
      }
      output.set(
        low.map((byte) => byte ^ 0x2d),
        half * 128,
      );
      output.set(
        high.map((byte) => byte ^ 0x2d),
        half * 128 + 64,
      );
    }
    return output;
  }
}

// Address-independent SAP source expansion, ported from ApplePackage (MIT).
import { data } from './tables';

export const initialOrder = [13, 0, 11, 10, 6, 12, 15, 1, 5, 14, 2, 4, 3, 8, 9, 7];
export const terminalOrder = [13, 4, 8, 9, 14, 1, 7, 15, 12, 2, 6, 0, 11, 3, 10, 5];

function linear(value: number, basis: number[], constant = 0): number {
  for (let bit = 0; bit < 8; bit++) if (value & (1 << bit)) constant ^= basis[bit];
  return constant;
}

export function prepareSource(source: Uint8Array) {
  if (source.length !== 576) throw new Error('Invalid SAP session source');
  const lengths = Array.from({ length: 16 }, () => Array<number>(11).fill(0));
  for (let column = 0; column < 11; column++) {
    const bank = [0xe0, 0xf0, 0xc0][Math.floor(column / 4)];
    const moduli = [
      [7, 27, 47, 77],
      [9, 29, 49, 79],
      [5, 25, 45, 75],
    ][Math.floor(column / 4)];
    for (let group = 0; group < 4; group++) {
      const at = 4 * (column % 4) + group;
      const value = source[0x30 + at] ^ source[bank + at];
      for (let lane = 0; lane < 4; lane++) lengths[4 * group + lane][column] = [3, 3, 5, 1][value % moduli[lane] & 3];
    }
    let cost = lengths.reduce((sum, row) => sum + row[column], 0);
    let row = (source[0x31] ^ source[0xc1]) & 15;
    while (cost > 32) {
      cost -= lengths[row][column] - 1;
      lengths[row][column] = 1;
      row = (row + 5) & 15;
    }
  }
  const selectors = Array.from({ length: 8 }, (_, index) => {
    const value = source[0xe0 + index] ^ source[0xf0 + index];
    return [value % 7, Math.floor(value / 7) % 7];
  }).flat();
  const size = ((source[0xfa] ^ source[0xca]) << 8) | (source[0xf3] ^ source[0xc3]);
  if (!size) throw new Error('Invalid SAP inverse cache');
  let seed = 0;
  for (const [a, b] of [
    [0xea, 0xfa],
    [0xe4, 0xf4],
    [0xed, 0xfd],
    [0xe6, 0xf6],
  ])
    seed = ((seed << 8) | (source[a] ^ source[b])) >>> 0;
  let state = seed;
  const states = Array.from({ length: 13 }, () => {
    // UInt64 multiplication is exact here; JS numbers would lose low bits.
    state = Number((BigInt(state) * BigInt(state) + 1n) % 0xfffffffbn);
    return state;
  });
  let mask = 1 << (seed & 7);
  for (let lane = 1; lane < 4; lane++) mask |= 1 << (8 * lane + (states[lane - 1] & 7));
  const basis = states.slice(3, 11);
  const header = states[11];
  state = states[12];
  const cache = Uint8Array.from(
    { length: size },
    (_, index) => source[(index + 3 * source[index % 576] + 2) % 576] ^ 0xd6,
  );
  const words: number[] = [];
  for (let index = 0; index < 256; index++) {
    let word = header ^ (state & mask);
    for (let bit = 0; bit < 8; bit++) if (index & (1 << bit)) word ^= basis[bit];
    words.push(word >>> 0);
    cache[((word & ~mask) >>> 0) % size] = index ^ 0xd6;
    const value = (state ^ 0x63) >>> 0;
    const correction = index !== 0 && (state & 0x80000000) !== 0 ? 512 : 0;
    const position = (17 * (value >>> 4) + 3 * (value & 15) + 176 + correction) % 576;
    state = 0;
    for (let byte = 0; byte < 4; byte++) state |= source[(position + byte) % 576] << (8 * byte);
    state >>>= 0;
  }
  const auxiliary0 = new Uint32Array(256);
  const auxiliary1 = new Uint32Array(256);
  words.forEach((word, index) => {
    auxiliary0[linear(index, [0x3c, 0x44, 0x73, 0xcc, 0x50, 0xba, 0x9e, 0xee])] = word ^ 0xd90b5d96;
    auxiliary1[linear(index, [0x9f, 0x72, 0xe1, 0x3b, 0xdd, 0x31, 0x24, 0x8f])] = word ^ 0xaa8095ee;
  });
  const cache2 = cache.map((value) => linear(value, [0xe3, 0x34, 0xda, 0x73, 0xb4, 0xa0, 0x4f, 0x2b], 0xc0));
  const cache3 = cache.map(
    (value, index) => linear(value, [0x1f, 0x35, 0x3b, 0xf7, 0xd9, 0xad, 0xd4, 0x93], 0x47) ^ ((index >>> 2) & 255),
  );
  function operand(row: number, position: number, length: number, base: number, column: number) {
    let key = 0;
    for (let byte = 0; byte < length; byte++)
      key ^=
        source[base + position + byte] ^ data.padColumns[column][(position + byte) % 16] ^ data.padRows[column][row];
    return key;
  }
  const caches = [
    [10, 0x1a0, initialOrder, states[11] ^ 0xe62818fc],
    [0, 0x40, terminalOrder, 0xaf615514],
  ] as const;
  const [initialCache, terminalCache] = caches.map(([column, base, order, bias]) => {
    const result = Array<number>(16).fill(0);
    let position = 0;
    order.forEach((slot, row) => {
      const length = lengths[row][column];
      if (length !== 1) result[slot] = (words[operand(row, position, length, base, column)] ^ bias) >>> 0;
      position += length;
    });
    return result;
  });
  const material = new Uint8Array(576);
  for (const [destination, origin] of [
    [0x20, 0xf0],
    [0x70, 0xe0],
    [0x120, 0xd0],
    [0x130, 0x220],
    [0x140, 0x110],
    [0x150, 0x100],
    [0x160, 0x80],
    [0x170, 0x120],
    [0x180, 0x20],
    [0x190, 0x90],
    [0x1a0, 0x190],
    [0x1b0, 0x230],
    [0x1e0, 0xc0],
    [0x1f0, 0x30],
  ])
    material.set(source.subarray(origin, origin + 16), destination);
  const offsets = [2, 12, 6, 16, 0, 8, 22, 28, 4, 26, 18, 10, 20, 30, 24, 14];
  let walk = 0;
  for (const [column, base, destination] of [
    [1, 0xa0, 0x200],
    [2, 0x200, 0x1c0],
    [3, 0x60, 0xc0],
    [4, 0, 0],
    [5, 0x1c0, 0x50],
    [6, 0x130, 0x80],
    [7, 0x1e0, 0xa0],
    [8, 0x170, 0x30],
    [9, 0x150, 0x100],
  ]) {
    let position = 0;
    for (let row = 0; row < 16; row++) {
      const length = lengths[row][column];
      const key = operand(row, position, length, base, column);
      walk = (walk + base + position) % 576;
      let first = source[walk];
      walk = (walk + base + position + 1) % 576;
      first = (first + source[walk]) & 255;
      const at = destination + offsets[row];
      material[at] = first;
      material[at + 1] = key - first;
      position += length;
    }
  }
  return {
    material,
    auxiliary0,
    auxiliary1,
    cache2,
    cache3,
    projectionMask: ~mask >>> 0,
    selectors,
    initialCache,
    terminalCache,
  };
}

import { initialOrder, prepareSource, terminalOrder } from './source';
import type { Bytes } from './bytes';
import type { Tables } from './tables';

export function createCipher(input: Bytes, tables: Tables): (block: Bytes) => Bytes {
  const source = prepareSource(input);
  const m = source.material;
  function pairWord(at: number, mask: number): number {
    let word = 0;
    for (let byte = 0; byte < 4; byte++) word |= (m[at + byte] ^ m[0x120 + ((mask + byte) % 16)]) << (8 * byte);
    return word >>> 0;
  }
  const initial = source.initialCache.slice();
  const terminal = source.terminalCache.slice();
  initialOrder.forEach((slot, row) => {
    if (!initial[slot]) initial[slot] = (pairWord(0x180 + 4 * row, 4 * (row % 4)) ^ 0xe62818fc) >>> 0;
  });
  terminalOrder.forEach((slot, row) => {
    if (!terminal[slot]) {
      const offset = row < 5 ? 0 : row < 13 ? 4 : 8;
      terminal[slot] = (pairWord(0x130 + 4 * row + offset, 4 * row + offset) ^ 0xaf615514) >>> 0;
    }
  });
  const initialField = Uint8Array.from({ length: 16 }, (_, index) => {
    const left = (3 * index + 7) % 16;
    const right = (11 * index + 2) % 16;
    return (((m[0x1e0 + left] ^ m[0x70 + left]) - (m[0x20 + right] ^ m[0x70 + right])) & 255) ^ 0x2d;
  });
  const seeds = [
    m[0x1f2] ^ m[0x72],
    m[0x1f7] ^ m[0x1e7],
    0x24,
    m[0x1eb] ^ m[0x2b],
    m[0x75] ^ m[0x1f5],
    0x11,
    m[0x23] ^ m[0x73],
  ];
  const rawWords = Array.from({ length: 9 }, (_, row) => {
    const physical = Array.from({ length: 4 }, (_, column) => {
      const index = 4 * row + 36 * column;
      return (pairWord(0x130 + index, index) + 0x2186d6ff) >>> 0;
    });
    return [physical[1], physical[3], physical[0], physical[2]];
  }).reverse();
  const pairs = [
    [0, 1],
    [8, 9],
    [22, 23],
    [28, 29],
    [20, 21],
    [30, 31],
    [24, 25],
    [14, 15],
    [2, 3],
    [12, 13],
    [6, 7],
    [16, 17],
    [4, 5],
    [26, 27],
    [18, 19],
    [10, 11],
  ];
  const roundKeys = [0x100, 0x30, 0xa0, 0x80, 0x50, 0, 0xc0, 0x1c0, 0x200].map((offset) =>
    pairs.map(([a, b]) => (m[offset + a] + m[offset + b]) & 255),
  );
  const terminalWords = Array.from({ length: 16 }, (_, slot) => {
    const mask = ((m[0x1f0 + slot] ^ m[0x70 + slot]) + (m[0x20 + slot] ^ m[0x70 + slot])) & 255;
    return tables.bytes[40 + ((79 * slot) % 144)].map((value) => value ^ mask) as Bytes;
  }).map((indices) => Uint32Array.from(indices, (index) => source.auxiliary0[index]));
  const byteCaches = Array.from({ length: 16 }, (_, slot) => {
    const index = (13 * slot) % 16;
    const mask = (((m[0x1e0 + index] ^ m[0x70 + index]) - (m[0x20 + index] ^ m[0x70 + index])) & 255) ^ 0xfe;
    return source.cache2.map((value) => tables.bytes[184 + ((9 * slot) % 16)][value ^ mask]);
  });
  const initialTables = Array.from({ length: 16 }, (_, slot) =>
    Uint8Array.from({ length: 256 }, (_, byte) => {
      const word = source.auxiliary1[byte ^ 0x2d] ^ initial[initialOrder[slot]];
      const index = (((word ^ 0x4ca88d12) & source.projectionMask) >>> 0) % source.cache2.length;
      return byteCaches[(5 * slot) % 16][index];
    }),
  );
  const fieldWords = [rawWords[3][2], rawWords[3][0], rawWords[3][3], rawWords[3][1]].map(
    (word) => (word + 0xde792901) >>> 0,
  );
  const updatedField = initialField.map(
    (value, index) =>
      value ^
      tables.masks[index % 4][fieldWords[Math.floor(index / 4)] % [233, 239, 241, 251][index % 4]] ^
      [0xf6, 0x19, 0x50, 0x8e][index % 4],
  );
  const carryFrames = [
    [0, 2, 11, 12].map((index) => initialField[index]),
    [6, 1, 3, 14].map((index) => updatedField[index]),
    [8, 9, 13, 15].map((index) => updatedField[index]),
  ];
  const terminalCache = source.cache3.map((value, index) => value ^ ((index >>> 2) & 255) ^ 0xfa);
  const terminalDestinations = [13, 5, 10, 2, 14, 1, 11, 8, 6, 9, 0, 15, 4, 7, 3, 12];
  const coefficientOrder = [3, 1, 6, 8, 10, 4, 0, 12, 7, 2, 13, 5, 14, 15, 9, 11];
  const laneKeys = terminalDestinations.map(
    (destination, lane) =>
      terminal[coefficientOrder[lane]] ^ source.auxiliary0[updatedField[destination] ^ 0x2d] ^ 0xaf615514,
  );
  const keyOrder = [12, 0, 1, 8, 5, 7, 9, 4, 2, 14, 11, 13, 3, 10, 15, 6];
  const nonlinear = Array.from({ length: 8 }, (_, stage) => {
    const result: Bytes[] = [];
    [4, 0, 15, 8, 11, 9, 7, 12, 14, 2, 5, 3, 13, 6, 1, 10].forEach((position, lane) => {
      const round = ([2, 4, 8, 3, 7, 2, 6, 1, 5, 0, 4, 8, 3, 7, 2, 6][position] + 2 * stage) % 9;
      result[keyOrder[lane]] = tables.bytes[40 + 16 * round + position];
    });
    return result;
  });

  return (block: Bytes): Bytes => {
    if (block.length !== 16) throw new Error('SAP cipher requires a 16-byte block');
    const masked = block.map((value) => value ^ 0x2d);
    let state = new Uint8Array(17);
    [4, 5, 1, 13, 15, 0, 9, 8, 16, -1, 12, 10, 11, 3, 2, 14].forEach((destination, index) => {
      if (destination >= 0) state[destination] = initialTables[index][masked[index]];
    });
    state[6] = state[4] ^ state[14] ^ state[15];
    state[7] = state[6] ^ initialTables[9][masked[9]];
    const carries = carryFrames.map((frame, index) => {
      const offset = 4 * index;
      let value = ((frame[0] ^ 0x2d) + (masked[offset] ^ [0x20, 0x26, 0x28][index]) - (frame[1] ^ 0x2d)) & 255;
      value ^= masked[offset + 1] ^ 0x2d;
      value = (value + (frame[2] ^ 0x2d) - (masked[offset + 2] ^ 0x2d)) & 255;
      return ((value ^ frame[3] ^ 0x2d) + (masked[offset + 3] ^ 0x2d)) & 255;
    });
    const expanded = Uint8Array.from(
      { length: 17 },
      (_, index) => (((masked[(3 + 7 * index) % 16] ^ 0x2d) + index) & 255) ^ 0x2d,
    );
    const slices: Bytes[] = [];
    slices[0] = expanded;
    slices[8] = expanded;
    for (let stage = 0; stage < 9; stage++) {
      const carry = carries[stage < 4 ? 0 : stage < 8 ? 1 : 2];
      const previous = slices[[8, 0, 0, 1, 1, 1, 4, 2, 2][stage]];
      const key = roundKeys[stage];
      const accumulators = Uint32Array.from(rawWords[stage], (word) => word + 0xde792901);
      accumulators[0] ^= 0x96588d1f;
      const indexSources = [15, 5, 2, 10, 11, 7, 9, 13, 4, 3, 12, 8, 16, 0, 1, 14];
      const firstTables = [28, 39, 50, 61, 28, 39, 50, 61, 56, 67, 6, 17, 56, 67, 6, 17];
      for (let lane = 0; lane < 16; lane++) {
        const index = state[indexSources[lane]] ^ key[lane] ^ (lane === 5 ? state[6] : 0);
        accumulators[Math.floor(lane / 4)] ^= tables.words[(firstTables[lane] - 16 * stage + 144) % 72][index];
      }
      const mixed = new Uint8Array(17);
      const columns = [1, 3, 1, 2, 3, 3, 2, 3, -1, 0, 2, 0, 0, 2, 1, 0, 1];
      const shifts = [24, 0, 8, 0, 8, 24, 24, 16, 0, 8, 8, 16, 0, 16, 0, 24, 16];
      const masks = [0x2d, 0x2d, 0x2d, 0x2d, 0x2d, 0x2d, 0x2d, 0x2d, 0, 0xa0, 0x2d, 0x75, 0x32, 0, 0x2d, 0xbb, 0x2d];
      for (let position = 0; position < 17; position++)
        if (position !== 8) mixed[position] = (accumulators[columns[position]] >>> shifts[position]) ^ masks[position];
      mixed[8] = previous[16] ^ previous[8] ^ ((accumulators[0] >>> 16) & 255) ^ 0x75 ^ state[9] ^ key[6] ^ carry;
      mixed[13] ^= mixed[8];
      if (stage === 8) {
        const coupled = mixed[8] ^ mixed[13];
        const left = (((mixed[12] ^ 0x31) + 0x6a) ^ 0x2d) - 0x80;
        let middle = ((mixed[14] ^ 0xd2) + 0x4c + left) & 255;
        middle = (((middle ^ mixed[13]) + 1) ^ 0x7e) & 255;
        const mixing = (middle + (mixed[15] ^ 0x2d)) & 255;
        const result = Uint8Array.from(source.selectors, (selector) => seeds[selector]);
        [4, 10, -1, 7, 11, 2, 0, 1, 16, 9, 3, 6, 12, 5, 15, 14].forEach((position, lane) => {
          const index = position < 0 ? coupled : mixed[position] ^ 0x2d;
          let word = terminalWords[terminalDestinations[lane]][index];
          if (position < 0)
            word ^=
              source.auxiliary0[coupled ^ mixing] ^
              source.auxiliary0[mixing] ^
              source.auxiliary0[coupled] ^
              source.auxiliary0[0];
          word ^= laneKeys[lane];
          result[terminalDestinations[lane]] ^=
            terminalCache[((word & source.projectionMask) >>> 0) % terminalCache.length];
        });
        return result.map((value) => value ^ 0x2d);
      }
      slices[stage] = mixed;
      state = new Uint8Array(17);
      const destinations = [0, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13, 14, 15, 16];
      const order = [9, 6, 1, 0, 5, 3, 14, 7, 12, 2, 15, 11, 4, 8];
      const inputs = [9, 16, 2, 3, 10, 15, 11, 5, 14, 7, 6, 0, 12, 1];
      destinations.forEach((destination, lane) => {
        state[destination] = nonlinear[stage][order[lane]][mixed[inputs[lane]] ^ 0x2d];
      });
      state[1] = nonlinear[stage][10][mixed[8] ^ mixed[13]];
      state[6] = carry ^ state[3] ^ state[4] ^ state[5];
      state[7] = state[6] ^ nonlinear[stage][13][mixed[4] ^ 0x2d];
    }
    throw new Error('Invalid SAP cipher stage');
  };
}

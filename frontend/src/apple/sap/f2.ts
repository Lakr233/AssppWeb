import { read32 } from './bytes';
import { data } from './tables';
import type { Bytes } from './bytes';
import type { Tables } from './tables';

export function deriveF2(key: Bytes, input: Bytes, tables: Tables): Bytes {
  if (key.length !== 16 || input.length !== 16) throw new Error('Invalid SAP F2 inputs');
  const bytes = tables.f2;
  const encoded = key.map((value, index) => bytes[256 * index + value]);
  const words = Array.from({ length: 4 }, (_, index) => read32(encoded, 4 * index));
  for (const step of data.expansion) {
    let word = step.selection.reduce((value, index) => value ^ words[index], 0);
    word = ((word << 8) | (word >>> 24)) ^ step.whitening;
    let substituted = 0;
    for (let position = 0; position < 4; position++) {
      const shift = 24 - 8 * position;
      substituted |= bytes[4096 + 256 * position + ((word >>> shift) & 255)] << shift;
    }
    words.push(substituted >>> 0);
  }
  const additions = data.keySelections.map((row) =>
    Uint8Array.from(row, (selection) => {
      const word = selection.words.reduce((value, index) => value ^ words[index], 0);
      let byte = (word >>> selection.shift) & 255;
      if (selection.linear >= 0) byte = bytes[17408 + 256 * selection.linear + byte];
      return byte ^ selection.whitening;
    }),
  );
  let state = additions[0].slice();
  for (let position = 0; position < 16; position++)
    state[data.entryPositions[position]] ^= bytes[5120 + 256 * position + input[position]];
  data.mainRouting.forEach((row, round) => {
    const output = additions[round + 1].slice();
    row.forEach((routing, position) => {
      const word = read32(bytes, 13312 + 4 * (256 * routing.table + state[position]), true);
      routing.destinations.forEach((destination, index) => {
        output[destination] ^= (word >>> (24 - 8 * index)) & 255;
      });
    });
    state = output;
  });
  const output = additions[10].slice();
  for (let position = 0; position < 16; position++)
    output[data.finalPositions[position]] ^= bytes[9216 + 256 * position + state[position]];
  return output.map((value) => value ^ 0x2d);
}

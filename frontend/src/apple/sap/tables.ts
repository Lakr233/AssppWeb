import data from './tables.json';
import { digest, fromBase64, read32 } from './bytes';

export { data };

export async function loadTables() {
  const pools = await Promise.all(
    ['byte-tables', 'word-tables', 'carry-masks', 'f2-tables'].map(async (name) => {
      const resource = data[name as 'byte-tables'];
      const bytes = fromBase64(resource.base64);
      const hash = Array.from(await digest('SHA-256', bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
      if (bytes.length !== resource.size || hash !== resource.sha256) throw new Error('Invalid SAP algorithm tables');
      return bytes;
    }),
  );
  const [bytes, words, masks, f2] = pools;
  let offset = 0;
  return {
    bytes: Array.from({ length: 200 }, (_, index) => bytes.slice(index * 256, (index + 1) * 256)),
    words: Array.from({ length: 72 }, (_, table) =>
      Uint32Array.from({ length: 256 }, (_, index) => read32(words, 1024 * table + 4 * index, true)),
    ),
    masks: [233, 239, 241, 251].map((length) => {
      const part = masks.slice(offset, offset + length);
      offset += length;
      return part;
    }),
    f2,
  };
}

export type Tables = Awaited<ReturnType<typeof loadTables>>;

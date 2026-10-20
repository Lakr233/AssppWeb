import { be32, concat, digest, xor } from './bytes';
import { createCipher } from './cipher';
import { deriveF2 } from './f2';
import { data, loadTables } from './tables';
import type { Bytes } from './bytes';
import type { SAPSession } from './handshake';

export async function createSigner(session: SAPSession, platform = 1) {
  const tables = await loadTables();
  const encrypt = createCipher(session.source, tables);
  const f2 = concat(deriveF2(session.f2Input1, session.f2Input2, tables), session.f2Tail);
  let blob: Bytes | undefined;
  return {
    async sign(body: Bytes): Promise<Bytes> {
      if (!blob) {
        const f1 = session.random.f1(session.seed30, session.f1Address);
        blob = concat(
          Uint8Array.of(3),
          be32(platform),
          be32(256),
          f1,
          be32(f2.length),
          f2,
          be32(session.f3.length),
          session.f3,
        );
        blob = concat(blob, new Uint8Array((16 - (blob.length % 16)) % 16));
      }
      // Advance the stream before awaiting so concurrent callers cannot reuse an IV.
      const iv = session.random.fill(session.seed54, session.ivAddress, data.IV_WHITEN, 0x12, 16);
      const hash = await digest('SHA-1', concat(blob, body));
      const first = encrypt(xor(iv, hash.slice(0, 16)));
      const tag = encrypt(xor(first, concat(hash.slice(16), new Uint8Array(12))));
      return concat(Uint8Array.of(2), iv, tag, be32(blob.length), blob);
    },
  };
}

export type SAPSigner = Awaited<ReturnType<typeof createSigner>>;

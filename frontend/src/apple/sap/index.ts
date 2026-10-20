import { buildPlist, parsePlist } from '../plist';
import { appleRequest } from '../request';
import { createHandshake } from './handshake';
import { createSigner } from './signer';
import type { Bytes } from './bytes';

export async function connectSAP() {
  async function exchange(host: string, path: string, key: string, payload?: Bytes): Promise<Bytes> {
    const response = await appleRequest({
      method: payload ? 'POST' : 'GET',
      host,
      path,
      headers: { 'Content-Type': 'application/x-apple-plist' },
      body: payload ? buildPlist({ 'sign-sap-setup-buffer': payload }) : undefined,
    });
    if (response.status !== 200 || response.body.length > 2 * 1024 * 1024)
      throw new Error(`SAP setup failed (HTTP ${response.status})`);
    const value = parsePlist(response.body)?.[key];
    if (!(value instanceof Uint8Array) || !value.length || value.length > 1048576)
      throw new Error('Invalid SAP setup service response');
    return new Uint8Array(value);
  }
  const certificate = await exchange('s.mzstatic.com', '/sap/setupCert.plist', 'sign-sap-setup-cert');
  const handshake = await createHandshake(certificate);
  const reply = await exchange(
    'fpinit.itunes.apple.com',
    '/v1/signSapSetup/legacy',
    'sign-sap-setup-buffer',
    handshake.request,
  );
  return createSigner(await handshake.complete(reply));
}

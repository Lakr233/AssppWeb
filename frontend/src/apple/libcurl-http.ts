import type { HttpClient } from '@lbr77/anisette-js';
import { initLibcurl, libcurl } from './libcurl-init';

export class LibcurlHttpClient implements HttpClient {
  async get(url: string, headers: Record<string, string>): Promise<Uint8Array> {
    await initLibcurl();

    const response = await libcurl.fetch(url, {
      method: 'GET',
      headers,
      insecure: true, // Allow self-signed certs, as some endpoints use them
      _libcurl_http_version: 1.1,
    });

    if (!response.ok) {
      throw new Error(`HTTP GET ${url} failed: ${response.status} ${response.statusText}`);
    }

    return new Uint8Array(await response.arrayBuffer());
  }

  async post(
    url: string,
    body: string,
    headers: Record<string, string>
  ): Promise<Uint8Array> {
    await initLibcurl();

    const response = await libcurl.fetch(url, {
      method: 'POST',
      body,
      headers,
      insecure: true, // Allow self-signed certs, as some endpoints use them
      _libcurl_http_version: 1.1,
    });

    if (!response.ok) {
      throw new Error(`HTTP POST ${url} failed: ${response.status} ${response.statusText}`);
    }

    return new Uint8Array(await response.arrayBuffer());
  }
}

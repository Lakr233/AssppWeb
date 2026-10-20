import { libcurl, initLibcurl } from './libcurl-init';
import { buildCookieHeader } from './cookies';
import { userAgent } from './config';
import type { Cookie } from '../types';

export interface AppleRequestOptions {
  host: string;
  path: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
  cookies?: Cookie[];
}

export interface AppleResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  rawHeaders: [string, string][];
  body: string;
}

export async function appleRequest(opts: AppleRequestOptions): Promise<AppleResponse> {
  await initLibcurl();

  const url = `https://${opts.host}${opts.path}`;
  const headers: Record<string, string> = {
    'User-Agent': userAgent,
    ...opts.headers,
  };

  if (opts.cookies?.length) {
    const cookieHeader = buildCookieHeader(opts.cookies, url);
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader;
    }
  }

  const resp = await libcurl.fetch(url, {
    method: opts.method,
    headers,
    body: opts.body,
    redirect: 'manual',
    _libcurl_http_version: 1.1,
  });

  const responseHeaders: Record<string, string> = {};
  for (const [key, value] of resp.raw_headers) {
    responseHeaders[key.toLowerCase()] = value;
  }

  const body = await resp.text();

  return {
    status: resp.status,
    statusText: resp.statusText,
    headers: responseHeaders,
    rawHeaders: resp.raw_headers,
    body,
  };
}

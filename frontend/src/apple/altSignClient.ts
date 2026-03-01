import { AppleAPI, Fetch } from 'altsign.js';
import { initLibcurl, libcurl } from './libcurl-init';

const altSignFetch = new Fetch(initLibcurl, async (url, options) => {
  console.log(`altSignFetch: ${options.method} ${url}`, options);
  return libcurl.fetch(url, {
    method: options.method,
    headers: options.headers,
    body: options.body,
    insecure: true, // Allow bypass gas.apple.com
    redirect: 'manual',
    _libcurl_http_version: 1.1,
  });
});

let appleApi: AppleAPI | null = null;

export function getAppleApi(): AppleAPI {
  if (appleApi) {
    return appleApi;
  }

  appleApi = new AppleAPI(altSignFetch);
  return appleApi;
}

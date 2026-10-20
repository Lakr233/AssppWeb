declare module 'libcurl.js' {
  interface LibcurlResponse {
    ok: boolean;
    status: number;
    statusText: string;
    headers: Headers;
    raw_headers: [string, string][];
    text(): Promise<string>;
    json(): Promise<any>;
    arrayBuffer(): Promise<ArrayBuffer>;
  }

  interface LibcurlFetchOptions {
    method?: string;
    headers?: Record<string, string> | Headers;
    body?: string | ArrayBuffer | Uint8Array;
    redirect?: 'follow' | 'manual' | 'error';
    proxy?: string;
    _libcurl_verbose?: number;
    _libcurl_http_version?: number;
  }

  interface Libcurl {
    ready: boolean;
    onload: (() => void) | null;
    set_websocket(url: string): void;
    load_wasm(url?: string): Promise<void>;
    fetch(url: string, options?: LibcurlFetchOptions): Promise<LibcurlResponse>;
    get_error_string(code: number): string;
    get_cacert(): string;
    version: string;
  }

  export const libcurl: Libcurl;
}

declare module 'libcurl.js/bundled' {
  import type { Libcurl } from 'libcurl.js';
  export const libcurl: Libcurl;
}

import { describe, it, expect, afterEach } from 'vitest';
import { createServer, Server } from 'http';
import net from 'net';
import { WebSocket } from 'ws';
import express from 'express';
import { server as wisp } from '@mercuryworkshop/wisp-js/server';
import { setupWsProxy } from '../src/services/wsProxy.js';

let httpServer: Server | null = null;
let serverPort: number;

async function startServer() {
  const app = express();
  httpServer = createServer(app);
  setupWsProxy(httpServer);

  await new Promise<void>((resolve) => {
    httpServer!.listen(0, () => {
      serverPort = (httpServer!.address() as net.AddressInfo).port;
      resolve();
    });
  });
}

async function stopServer() {
  if (!httpServer) return;
  const server = httpServer;
  httpServer = null;
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}

describe('Wisp Proxy', () => {
  afterEach(async () => {
    await stopServer();
  });

  it('should accept WebSocket connections on /wisp/ path', async () => {
    await startServer();

    const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/wisp/`);

    const opened = await new Promise<boolean>((resolve) => {
      ws.on('open', () => resolve(true));
      ws.on('error', () => resolve(false));
      setTimeout(() => resolve(false), 5000);
    });

    expect(opened).toBe(true);
    ws.close();
  });

  it('should reject connections on non-wisp paths', async () => {
    await startServer();

    const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/proxy?host=buy.itunes.apple.com&port=443`);

    const rejected = await new Promise<boolean>((resolve) => {
      ws.on('error', () => resolve(true));
      ws.on('close', () => resolve(true));
      ws.on('open', () => {
        ws.close();
        resolve(false);
      });
    });

    expect(rejected).toBe(true);
  });

  it('should reject connections on random paths', async () => {
    await startServer();

    const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/other`);

    const rejected = await new Promise<boolean>((resolve) => {
      ws.on('error', () => resolve(true));
      ws.on('close', () => resolve(true));
      ws.on('open', () => {
        ws.close();
        resolve(false);
      });
    });

    expect(rejected).toBe(true);
  });

  // Every host the client reaches through the tunnel has to be listed. A path
  // that targets an unlisted one has its stream closed mid-handshake, which
  // libcurl reports as "error code 35: SSL connect error" with nothing naming
  // the host — so it is worth failing here instead.
  describe('hostname allowlist', () => {
    function allows(host: string): boolean {
      return wisp.options.hostname_whitelist.some((pattern: RegExp) => pattern.test(host));
    }

    it.each([
      ['init.itunes.apple.com', 'bag'],
      ['buy.itunes.apple.com', 'auth and purchase'],
      ['p18-buy.itunes.apple.com', 'pod-routed store calls'],
      ['downloaddispatch.itunes.apple.com', 'failureType 5002 fallback'],
      ['uclient-api.itunes.apple.com', 'version listing'],
      ['fpinit.itunes.apple.com', 'SAP setup key exchange'],
      ['s.mzstatic.com', 'SAP setup certificate'],
    ])('allows %s (%s)', (host) => {
      expect(allows(host)).toBe(true);
    });

    it.each(['example.com', 'itunes.apple.com.evil.test', 'notfpinit.itunes.apple.com', 's.mzstatic.com.evil.test'])(
      'rejects %s',
      (host) => {
        expect(allows(host)).toBe(false);
      },
    );
  });
});

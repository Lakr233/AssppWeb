declare module '@mercuryworkshop/wisp-js/server' {
  import type { IncomingMessage } from 'http';
  import type { Duplex } from 'stream';

  interface WispOptions {
    hostname_blacklist: RegExp[] | null;
    hostname_whitelist: RegExp[] | null;
    port_blacklist: (number | [number, number])[] | null;
    port_whitelist: (number | [number, number])[] | null;
    allow_direct_ip: boolean;
    allow_private_ips: boolean;
    allow_loopback_ips: boolean;
    client_ip_blacklist: string[] | null;
    client_ip_whitelist: string[] | null;
    stream_limit_per_host: number;
    stream_limit_total: number;
    allow_udp_streams: boolean;
    allow_tcp_streams: boolean;
    dns_ttl: number;
    dns_method: string;
    dns_servers: string[] | null;
    dns_result_order: string;
    parse_real_ip: boolean;
    parse_real_ip_from: string[];
    wisp_version: number;
    wisp_motd: string | null;
  }

  export const server: {
    options: WispOptions;
    routeRequest(req: IncomingMessage, socket: Duplex, head: Buffer, conn_options?: Record<string, any>): void;
  };
}

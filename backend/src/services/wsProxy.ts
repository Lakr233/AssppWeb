import { Server as HttpServer } from "http";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";

// Allow only Apple hosts required by bag/auth/purchase/version flows.
wisp.options.hostname_whitelist = [
  /^auth\.itunes\.apple\.com$/,
  /^buy\.itunes\.apple\.com$/,
  /^init\.itunes\.apple\.com$/,
  /^p\d+-buy\.itunes\.apple\.com$/,
];
wisp.options.port_whitelist = [443];
wisp.options.allow_direct_ip = false;
// allow_private_ips must be true: Docker/container DNS may resolve whitelisted
// hostnames to reserved-range IPs (e.g. 198.18.x.x in OrbStack). The hostname
// whitelist above is the primary security control.
wisp.options.allow_private_ips = true;
wisp.options.allow_loopback_ips = false;

export function setupWsProxy(server: HttpServer) {
  server.on("upgrade", (req, socket, head) => {
    if (req.url === "/wisp/" || req.url?.startsWith("/wisp/?")) {
      wisp.routeRequest(req, socket, head);
    } else {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
    }
  });
}

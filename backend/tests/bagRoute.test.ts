import { describe, it, expect, vi, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import https from "https";
import { EventEmitter } from "events";
import bagRoutes from "../src/routes/bag.js";

function createApp() {
  const app = express();
  app.use("/api", bagRoutes);
  return app;
}

describe("Bag Route", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends Configurator headers when fetching bag", async () => {
    const getSpy = vi
      .spyOn(https, "get")
      .mockImplementation((url: any, options: any, cb: any) => {
        const response = new EventEmitter() as any;
        response.statusCode = 200;
        setTimeout(() => {
          response.emit(
            "data",
            '<Document><Protocol><plist version="1.0"><dict><key>urlBag</key><dict><key>authenticateAccount</key><string>https://buy.itunes.apple.com/WebObjects/MZFinance.woa/wa/authenticate</string></dict></dict></plist></Protocol></Document>',
          );
          response.emit("end");
        }, 0);
        cb(response);
        return new EventEmitter() as any;
      });

    const app = createApp();
    const res = await request(app).get("/api/bag?guid=aabbccddeeff");

    expect(res.status).toBe(200);
    expect(res.text).toContain("<plist");
    expect(getSpy).toHaveBeenCalledTimes(1);

    const [, options] = getSpy.mock.calls[0];
    expect(options.headers["User-Agent"]).toContain("Configurator/2.17");
    expect(options.headers.Accept).toBe("application/xml");
  });

  it("returns 502 when bag upstream is HTTP error", async () => {
    vi.spyOn(https, "get").mockImplementation(
      (url: any, options: any, cb: any) => {
        const response = new EventEmitter() as any;
        response.statusCode = 403;
        setTimeout(() => {
          response.emit("data", "forbidden");
          response.emit("end");
        }, 0);
        cb(response);
        return new EventEmitter() as any;
      },
    );

    const app = createApp();
    const res = await request(app).get("/api/bag?guid=aabbccddeeff");

    expect(res.status).toBe(502);
    expect(res.body.error).toBe("Bag request failed");
  });
});

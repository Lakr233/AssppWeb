import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiGet, apiPost, apiDelete } from "../../src/api/client";

describe("api/client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("apiGet", () => {
    it("should make GET request and return JSON", async () => {
      const mockData = { results: [] };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response);

      const result = await apiGet("/api/test");
      expect(result).toEqual(mockData);
      expect(fetch).toHaveBeenCalledWith("/api/test", {
        headers: {},
      });
    });

    it("should throw on non-ok response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve("Not found"),
      } as Response);

      await expect(apiGet("/api/missing")).rejects.toThrow("Not found");
    });
  });

  describe("apiPost", () => {
    it("should make POST request with JSON body", async () => {
      const mockResponse = { id: "123" };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await apiPost("/api/test", { data: "value" });
      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith("/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: "value" }),
      });
    });

    it("should handle POST without body", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      } as Response);

      await apiPost("/api/test");
      expect(fetch).toHaveBeenCalledWith("/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: undefined,
      });
    });
  });

  describe("apiDelete", () => {
    it("should make DELETE request", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
      } as Response);

      await apiDelete("/api/test/123");
      expect(fetch).toHaveBeenCalledWith("/api/test/123", {
        method: "DELETE",
        headers: {},
      });
    });

    it("should throw on non-ok response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve("Server error"),
      } as Response);

      await expect(apiDelete("/api/test/123")).rejects.toThrow("Server error");
    });
  });
});

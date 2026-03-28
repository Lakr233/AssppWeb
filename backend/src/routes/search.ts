import { Router, Request, Response } from "express";

const router = Router();

// Allowlisted parameters for iTunes search/lookup API
const ALLOWED_SEARCH_PARAMS = new Set([
  "term",
  "country",
  "media",
  "entity",
  "attribute",
  "limit",
  "lang",
  "version",
  "explicit",
  "id",
  "bundleId",
]);

function sanitizeParams(query: Record<string, any>): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of ALLOWED_SEARCH_PARAMS) {
    const value = query[key];
    if (value !== undefined && typeof value === "string") {
      params.set(key, value);
    }
  }
  return params;
}

// Map iTunes API fields to our Software type, matching Swift CodingKeys
function mapSoftware(item: Record<string, any>) {
  return {
    id: item.trackId,
    bundleID: item.bundleId,
    name: item.trackName,
    version: item.version,
    price: item.price,
    artistName: item.artistName,
    sellerName: item.sellerName,
    description: item.description,
    averageUserRating: item.averageUserRating,
    userRatingCount: item.userRatingCount,
    artworkUrl: item.artworkUrl512,
    screenshotUrls: item.screenshotUrls ?? [],
    minimumOsVersion: item.minimumOsVersion,
    fileSizeBytes: item.fileSizeBytes,
    releaseDate: item.currentVersionReleaseDate ?? item.releaseDate,
    releaseNotes: item.releaseNotes,
    formattedPrice: item.formattedPrice,
    primaryGenreName: item.primaryGenreName,
  };
}

router.get("/search", async (req: Request, res: Response) => {
  try {
    const params = sanitizeParams(req.query);
    if (!params.has("term")) {
      res.status(400).json({ error: "Missing required parameter: term" });
      return;
    }
    const response = await fetch(
      `https://itunes.apple.com/search?${params.toString()}`,
    );
    const data = await response.json();
    const results = (data.results ?? []).map(mapSoftware);
    res.json(results);
  } catch (err) {
    console.error("Search error:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Search request failed" });
  }
});

router.get("/lookup", async (req: Request, res: Response) => {
  try {
    const params = sanitizeParams(req.query);
    if (!params.has("id") && !params.has("bundleId")) {
      res.status(400).json({ error: "Missing required parameter: id or bundleId" });
      return;
    }
    const response = await fetch(
      `https://itunes.apple.com/lookup?${params.toString()}`,
    );
    const data = await response.json();
    if (!data.resultCount || !data.results?.length) {
      res.json(null);
      return;
    }
    res.json(mapSoftware(data.results[0]));
  } catch (err) {
    console.error("Lookup error:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Lookup request failed" });
  }
});

export default router;

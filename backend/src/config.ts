export const config = {
  port: parseInt(process.env.PORT || "8080"),
  dataDir: process.env.DATA_DIR || "./data",
  publicBaseUrl: process.env.PUBLIC_BASE_URL || "",
  disableHttpsRedirect:
    process.env.UNSAFE_DANGEROUSLY_DISABLE_HTTPS_REDIRECT === "true",
  // Auto-cleanup: 0 disables
  autoCleanupDays: parseInt(process.env.AUTO_CLEANUP_DAYS || "0", 10) || 0,
  autoCleanupMaxMB: parseInt(process.env.AUTO_CLEANUP_MAX_MB || "0", 10) || 0,
  // Build info (injected via Docker build args)
  buildCommit: process.env.BUILD_COMMIT || "unknown",
  buildDate: process.env.BUILD_DATE || "unknown",
};

export const MAX_DOWNLOAD_SIZE = 8 * 1024 * 1024 * 1024; // 8 GB
export const DOWNLOAD_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 hours
export const BAG_TIMEOUT_MS = 15_000; // 15 seconds
export const BAG_MAX_BYTES = 1024 * 1024; // 1 MB
export const MIN_ACCOUNT_HASH_LENGTH = 8;

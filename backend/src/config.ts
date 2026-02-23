export const config = {
  port: parseInt(process.env.PORT || "8080"),
  dataDir: process.env.DATA_DIR || "./data",
  publicBaseUrl: process.env.PUBLIC_BASE_URL || "",
};

export const MAX_DOWNLOAD_SIZE = 4 * 1024 * 1024 * 1024; // 4 GB
export const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
export const BAG_TIMEOUT_MS = 15_000; // 15 seconds
export const BAG_MAX_BYTES = 1024 * 1024; // 1 MB
export const MIN_ACCOUNT_HASH_LENGTH = 8;

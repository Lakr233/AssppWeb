import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { v4 as uuidv4 } from "uuid";
import { config, MAX_DOWNLOAD_SIZE, DOWNLOAD_TIMEOUT_MS } from "../config.js";
import { inject } from "./sinfInjector.js";
import type { DownloadTask, Software, Sinf } from "../types/index.js";

const tasks = new Map<string, DownloadTask>();
const abortControllers = new Map<string, AbortController>();
const progressListeners = new Map<string, Set<(task: DownloadTask) => void>>();

const PACKAGES_DIR = path.join(config.dataDir, "packages");
const TASKS_FILE = path.join(config.dataDir, "tasks.json");
// Legacy file from old code — cleaned up on startup
const LEGACY_DOWNLOADS_FILE = path.join(config.dataDir, "downloads.json");

// --- Security: path segment validation ---
const SAFE_SEGMENT_RE = /^[a-zA-Z0-9._-]+$/;

/** Validate and sanitize a path segment. Rejects traversal, replaces unsafe chars. */
function safePathSegment(value: string, label: string): string {
  if (!value || value === "." || value === "..") {
    throw new Error(`Invalid ${label}`);
  }
  if (SAFE_SEGMENT_RE.test(value)) return value;
  const cleaned = value.replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!cleaned || cleaned === "." || cleaned === "..") {
    throw new Error(`Invalid ${label}`);
  }
  return cleaned;
}

// --- Security: download URL allowlist ---
const ALLOWED_DOWNLOAD_HOSTS_RE = /\.apple\.com$/i;

export function validateDownloadURL(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid download URL");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Download URL must use HTTPS");
  }

  if (!ALLOWED_DOWNLOAD_HOSTS_RE.test(parsed.hostname)) {
    throw new Error("Download URL must be from an Apple domain (*.apple.com)");
  }

  if (
    /^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname) ||
    parsed.hostname.startsWith("[")
  ) {
    throw new Error("Download URL must not use IP addresses");
  }
}

// --- Security: sanitize task for API responses ---
export function sanitizeTaskForResponse(
  task: DownloadTask,
): Omit<
  DownloadTask,
  "downloadURL" | "sinfs" | "iTunesMetadata" | "filePath"
> & { hasFile?: boolean } {
  const { downloadURL, sinfs, iTunesMetadata, filePath, ...safe } = task;
  return {
    ...safe,
    hasFile: !!filePath && fs.existsSync(filePath),
  };
}

// --- Persistence: save only completed task metadata (no secrets) ---
function persistTasks() {
  const completed = Array.from(tasks.values())
    .filter((t) => t.status === "completed" && t.filePath)
    .map((t) => ({
      id: t.id,
      software: t.software,
      accountHash: t.accountHash,
      downloadURL: "",
      sinfs: [],
      status: t.status,
      progress: t.progress,
      speed: t.speed,
      filePath: t.filePath,
      createdAt: t.createdAt,
    }));
  fs.writeFileSync(TASKS_FILE, JSON.stringify(completed, null, 2));
}

function initOnStartup() {
  // Remove legacy downloads.json from old code
  if (fs.existsSync(LEGACY_DOWNLOADS_FILE)) {
    fs.unlinkSync(LEGACY_DOWNLOADS_FILE);
  }

  // Ensure packages dir exists
  fs.mkdirSync(PACKAGES_DIR, { recursive: true });

  // Load completed tasks from previous run
  if (fs.existsSync(TASKS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(TASKS_FILE, "utf-8"));
      if (Array.isArray(data)) {
        for (const item of data) {
          // Only restore completed tasks whose IPA file still exists
          if (
            item.id &&
            item.status === "completed" &&
            item.filePath &&
            fs.existsSync(item.filePath)
          ) {
            const task: DownloadTask = {
              id: item.id,
              software: item.software,
              accountHash: item.accountHash,
              downloadURL: "",
              sinfs: [],
              status: "completed",
              progress: 100,
              speed: "0 B/s",
              filePath: item.filePath,
              createdAt: item.createdAt,
            };
            tasks.set(task.id, task);
          }
        }
      }
    } catch {
      // Corrupted file — start fresh
    }
  }

  // Clean up orphaned IPA files (files without a task)
  cleanOrphanedPackages();
}

function cleanOrphanedPackages() {
  const knownPaths = new Set<string>();
  for (const task of tasks.values()) {
    if (task.filePath) {
      knownPaths.add(path.resolve(task.filePath));
    }
  }

  const packagesBase = path.resolve(PACKAGES_DIR);

  function walkAndClean(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkAndClean(fullPath);
        // Remove empty directories
        if (fs.readdirSync(fullPath).length === 0) {
          fs.rmdirSync(fullPath);
        }
      } else if (entry.isFile() && !knownPaths.has(path.resolve(fullPath))) {
        // Orphaned file — remove
        fs.unlinkSync(fullPath);
      }
    }
  }

  walkAndClean(packagesBase);
}

// Initialize on startup
initOnStartup();

function notifyProgress(task: DownloadTask) {
  const listeners = progressListeners.get(task.id);
  if (listeners) {
    for (const listener of listeners) {
      listener(task);
    }
  }
}

export function addProgressListener(
  taskId: string,
  listener: (task: DownloadTask) => void,
) {
  let listeners = progressListeners.get(taskId);
  if (!listeners) {
    listeners = new Set();
    progressListeners.set(taskId, listeners);
  }
  listeners.add(listener);
}

export function removeProgressListener(
  taskId: string,
  listener: (task: DownloadTask) => void,
) {
  const listeners = progressListeners.get(taskId);
  if (listeners) {
    listeners.delete(listener);
    if (listeners.size === 0) {
      progressListeners.delete(taskId);
    }
  }
}

export function getAllTasks(): DownloadTask[] {
  return Array.from(tasks.values());
}

export function getTask(id: string): DownloadTask | undefined {
  return tasks.get(id);
}

export function deleteTask(id: string): boolean {
  const task = tasks.get(id);
  if (!task) return false;

  // Abort if downloading
  const controller = abortControllers.get(id);
  if (controller) {
    controller.abort();
    abortControllers.delete(id);
  }

  // Remove file if exists, with path safety check
  if (task.filePath) {
    const resolved = path.resolve(task.filePath);
    const packagesBase = path.resolve(PACKAGES_DIR);
    if (
      resolved.startsWith(packagesBase + path.sep) &&
      fs.existsSync(resolved)
    ) {
      fs.unlinkSync(resolved);

      // Clean up empty parent directories
      let dir = path.dirname(resolved);
      while (dir !== packagesBase && dir.startsWith(packagesBase)) {
        const contents = fs.readdirSync(dir);
        if (contents.length === 0) {
          fs.rmdirSync(dir);
          dir = path.dirname(dir);
        } else {
          break;
        }
      }
    }
  }

  tasks.delete(id);
  progressListeners.delete(id);
  persistTasks();
  return true;
}

export function pauseTask(id: string): boolean {
  const task = tasks.get(id);
  if (!task || task.status !== "downloading") return false;

  const controller = abortControllers.get(id);
  if (controller) {
    controller.abort();
    abortControllers.delete(id);
  }

  task.status = "paused";
  notifyProgress(task);
  return true;
}

export function resumeTask(id: string): boolean {
  const task = tasks.get(id);
  if (!task || task.status !== "paused") return false;

  startDownload(task);
  return true;
}

export function createTask(
  software: Software,
  accountHash: string,
  downloadURL: string,
  sinfs: Sinf[],
  iTunesMetadata?: string,
): DownloadTask {
  // Validate download URL
  validateDownloadURL(downloadURL);

  // Validate path segments
  safePathSegment(accountHash, "accountHash");
  safePathSegment(software.bundleID, "bundleID");
  safePathSegment(software.version, "version");

  const task: DownloadTask = {
    id: uuidv4(),
    software,
    accountHash,
    downloadURL,
    sinfs,
    iTunesMetadata,
    status: "pending",
    progress: 0,
    speed: "0 B/s",
    createdAt: new Date().toISOString(),
  };

  tasks.set(task.id, task);
  startDownload(task);
  return task;
}

async function startDownload(task: DownloadTask) {
  const controller = new AbortController();
  abortControllers.set(task.id, controller);

  // Set a global timeout for the entire download
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  task.status = "downloading";
  task.progress = 0;
  task.speed = "0 B/s";
  task.error = undefined;
  notifyProgress(task);

  // Sanitize path segments
  const safeAccountHash = safePathSegment(task.accountHash, "accountHash");
  const safeBundleID = safePathSegment(task.software.bundleID, "bundleID");
  const safeVersion = safePathSegment(task.software.version, "version");

  const dir = path.join(
    PACKAGES_DIR,
    safeAccountHash,
    safeBundleID,
    safeVersion,
  );

  // Verify the resolved path is within PACKAGES_DIR
  const resolvedDir = path.resolve(dir);
  const packagesBase = path.resolve(PACKAGES_DIR);
  if (!resolvedDir.startsWith(packagesBase + path.sep)) {
    task.status = "failed";
    task.error = "Invalid path";
    clearTimeout(timeout);
    notifyProgress(task);
    return;
  }

  fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `${task.id}.ipa`);
  task.filePath = filePath;

  try {
    // Re-validate download URL before fetching
    validateDownloadURL(task.downloadURL);

    const response = await fetch(task.downloadURL, {
      signal: controller.signal,
      redirect: "follow",
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    if (!response.body) {
      throw new Error("No response body");
    }

    // Check content length against max
    const contentLength = parseInt(
      response.headers.get("content-length") || "0",
    );
    if (contentLength > MAX_DOWNLOAD_SIZE) {
      throw new Error(
        `File too large: ${contentLength} bytes exceeds ${MAX_DOWNLOAD_SIZE} byte limit`,
      );
    }

    let downloaded = 0;
    let lastTime = Date.now();
    let lastBytes = 0;

    const writeStream = fs.createWriteStream(filePath);
    const reader = response.body.getReader();

    const readable = new Readable({
      async read() {
        try {
          const { done, value } = await reader.read();
          if (done) {
            this.push(null);
            return;
          }
          downloaded += value.byteLength;

          // Enforce max download size even without Content-Length
          if (downloaded > MAX_DOWNLOAD_SIZE) {
            this.destroy(new Error("Download exceeded maximum size"));
            return;
          }

          // Calculate speed every 500ms
          const now = Date.now();
          const elapsed = now - lastTime;
          if (elapsed >= 500) {
            const bytesPerSec = ((downloaded - lastBytes) / elapsed) * 1000;
            task.speed = formatSpeed(bytesPerSec);
            lastTime = now;
            lastBytes = downloaded;
          }

          if (contentLength > 0) {
            task.progress = Math.round((downloaded / contentLength) * 100);
          }

          notifyProgress(task);
          this.push(Buffer.from(value));
        } catch (err) {
          this.destroy(err instanceof Error ? err : new Error(String(err)));
        }
      },
    });

    await pipeline(readable, writeStream);

    abortControllers.delete(task.id);
    clearTimeout(timeout);

    // Inject sinfs
    if (task.sinfs.length > 0) {
      task.status = "injecting";
      task.progress = 100;
      notifyProgress(task);

      await inject(task.sinfs, filePath, task.iTunesMetadata);
    }

    task.status = "completed";
    task.progress = 100;

    // Strip sensitive data after successful compile
    task.downloadURL = "";
    task.sinfs = [];
    task.iTunesMetadata = undefined;

    // Persist completed task metadata (no secrets)
    persistTasks();
    notifyProgress(task);
  } catch (err) {
    abortControllers.delete(task.id);
    clearTimeout(timeout);

    if (err instanceof Error && err.name === "AbortError") {
      // Status may have been changed to "paused" externally by pauseTask()
      if ((task.status as string) === "paused") return;
      task.status = "failed";
      task.error = "Download timed out";
      notifyProgress(task);
      return;
    }

    task.status = "failed";
    console.error(
      `Download ${task.id} failed:`,
      err instanceof Error ? err.message : err,
    );
    task.error = "Download failed";
    notifyProgress(task);
  }
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`;
  if (bytesPerSec < 1024 * 1024)
    return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

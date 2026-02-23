import { Router, Request, Response } from "express";
import {
  createTask,
  getAllTasks,
  getTask,
  deleteTask,
  pauseTask,
  resumeTask,
  addProgressListener,
  removeProgressListener,
  sanitizeTaskForResponse,
  validateDownloadURL,
} from "../services/downloadManager.js";
import {
  getIdParam,
  requireAccountHash,
  verifyTaskOwnership,
} from "../utils/route.js";

const router = Router();

// Start a new download
router.post("/downloads", (req: Request, res: Response) => {
  const { software, accountHash, downloadURL, sinfs, iTunesMetadata } =
    req.body;

  if (!software || !accountHash || !downloadURL || !sinfs) {
    res.status(400).json({
      error:
        "Missing required fields: software, accountHash, downloadURL, sinfs",
    });
    return;
  }

  // Validate download URL before creating task
  try {
    validateDownloadURL(downloadURL);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "Invalid download URL",
    });
    return;
  }

  try {
    const task = createTask(
      software,
      accountHash,
      downloadURL,
      sinfs,
      iTunesMetadata,
    );
    res.status(201).json(sanitizeTaskForResponse(task));
  } catch (err) {
    console.error(
      "Create download error:",
      err instanceof Error ? err.message : err,
    );
    res.status(400).json({ error: "Failed to create download" });
  }
});

// List downloads filtered by account hashes
router.get("/downloads", (req: Request, res: Response) => {
  const hashesParam = req.query.accountHashes;
  if (!hashesParam || typeof hashesParam !== "string") {
    res.json([]);
    return;
  }
  const hashes = new Set(hashesParam.split(",").filter(Boolean));
  if (hashes.size === 0) {
    res.json([]);
    return;
  }
  const filtered = getAllTasks()
    .filter((t) => hashes.has(t.accountHash))
    .map(sanitizeTaskForResponse);
  res.json(filtered);
});

// Get single download (requires accountHash)
router.get("/downloads/:id", (req: Request, res: Response) => {
  const accountHash = requireAccountHash(req, res);
  if (!accountHash) return;

  const id = getIdParam(req);
  const task = getTask(id);
  if (!task) {
    res.status(404).json({ error: "Download not found" });
    return;
  }

  if (!verifyTaskOwnership(task, accountHash, res)) return;

  res.json(sanitizeTaskForResponse(task));
});

// SSE progress stream (requires accountHash)
router.get("/downloads/:id/progress", (req: Request, res: Response) => {
  const accountHash = requireAccountHash(req, res);
  if (!accountHash) return;

  const id = getIdParam(req);
  const task = getTask(id);
  if (!task) {
    res.status(404).json({ error: "Download not found" });
    return;
  }

  if (!verifyTaskOwnership(task, accountHash, res)) return;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // Send current state immediately
  res.write(`data: ${JSON.stringify(sanitizeTaskForResponse(task))}\n\n`);

  const listener = (updatedTask: typeof task) => {
    res.write(
      `data: ${JSON.stringify(sanitizeTaskForResponse(updatedTask))}\n\n`,
    );
  };

  addProgressListener(id, listener);

  req.on("close", () => {
    removeProgressListener(id, listener);
  });
});

// Pause download (requires accountHash)
router.post("/downloads/:id/pause", (req: Request, res: Response) => {
  const accountHash = requireAccountHash(req, res);
  if (!accountHash) return;

  const id = getIdParam(req);
  const task = getTask(id);
  if (!task) {
    res.status(404).json({ error: "Download not found" });
    return;
  }

  if (!verifyTaskOwnership(task, accountHash, res)) return;

  const success = pauseTask(id);
  if (!success) {
    res.status(400).json({ error: "Cannot pause this download" });
    return;
  }
  const updated = getTask(id);
  res.json(updated ? sanitizeTaskForResponse(updated) : { success: true });
});

// Resume download (requires accountHash)
router.post("/downloads/:id/resume", (req: Request, res: Response) => {
  const accountHash = requireAccountHash(req, res);
  if (!accountHash) return;

  const id = getIdParam(req);
  const task = getTask(id);
  if (!task) {
    res.status(404).json({ error: "Download not found" });
    return;
  }

  if (!verifyTaskOwnership(task, accountHash, res)) return;

  const success = resumeTask(id);
  if (!success) {
    res.status(400).json({ error: "Cannot resume this download" });
    return;
  }
  const updated = getTask(id);
  res.json(updated ? sanitizeTaskForResponse(updated) : { success: true });
});

// Delete download (requires accountHash)
router.delete("/downloads/:id", (req: Request, res: Response) => {
  const accountHash = requireAccountHash(req, res);
  if (!accountHash) return;

  const id = getIdParam(req);
  const task = getTask(id);
  if (!task) {
    res.status(404).json({ error: "Download not found" });
    return;
  }

  if (!verifyTaskOwnership(task, accountHash, res)) return;

  const success = deleteTask(id);
  if (!success) {
    res.status(404).json({ error: "Download not found" });
    return;
  }
  res.json({ success: true });
});

export default router;

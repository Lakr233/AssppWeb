import { Request, Response } from "express";

const MIN_ACCOUNT_HASH_LENGTH = 8;

export function getIdParam(req: Request): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0] : id;
}

export function requireAccountHash(req: Request, res: Response): string | null {
  const hash =
    (req.query.accountHash as string) || (req.body && req.body.accountHash);
  if (
    !hash ||
    typeof hash !== "string" ||
    hash.length < MIN_ACCOUNT_HASH_LENGTH
  ) {
    res.status(400).json({ error: "Missing or invalid accountHash parameter" });
    return null;
  }
  return hash;
}

export function verifyTaskOwnership(
  task: { accountHash: string },
  accountHash: string,
  res: Response,
): boolean {
  if (task.accountHash !== accountHash) {
    res.status(403).json({ error: "Access denied" });
    return false;
  }
  return true;
}

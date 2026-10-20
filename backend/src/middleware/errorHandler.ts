import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  console.error('Error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
}

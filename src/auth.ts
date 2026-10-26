import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { config } from './config.js';
function safeCompare(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
function verifyToken(req: Request, res: Response, next: NextFunction, expectedSecret: string) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing or invalid token format' });
    return;
  }
  const token = authHeader.split(' ')[1];
  if (!safeCompare(token, expectedSecret)) {
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
    return;
  }
  next();
}
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => verifyToken(req, res, next, config.ADMIN_SECRET);
export const requireProducer = (req: Request, res: Response, next: NextFunction) => verifyToken(req, res, next, config.PRODUCER_SECRET);

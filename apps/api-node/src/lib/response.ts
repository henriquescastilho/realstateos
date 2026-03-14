import { Response } from "express";

export function ok<T>(res: Response, data: T): void {
  res.status(200).json({ ok: true, data });
}

export function created<T>(res: Response, data: T): void {
  res.status(201).json({ ok: true, data });
}

export function noContent(res: Response): void {
  res.status(204).end();
}

export function paginated<T>(
  res: Response,
  data: T[],
  meta: { total: number; page: number; pageSize: number },
): void {
  res.status(200).json({ ok: true, data, meta });
}

export function errorResponse(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): void {
  res.status(statusCode).json({ ok: false, error: { code, message, details } });
}

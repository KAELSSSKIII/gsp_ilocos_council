import { NextFunction, Request, Response } from "express";
import { logger } from "../logger";

export function notFoundHandler(_req: Request, res: Response) {
  return res.status(404).json({ error: "Not found" });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (res.headersSent) {
    return;
  }

  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ error: "Invalid JSON payload" });
  }

  if (err instanceof Error && err.message === "Not allowed by CORS") {
    return res.status(403).json({ error: "Origin not allowed" });
  }

  logger.error({ err }, "Unhandled request error");
  return res.status(500).json({ error: "Internal server error" });
}

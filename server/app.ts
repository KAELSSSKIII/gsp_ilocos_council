import * as Sentry from "@sentry/node";
import compression from "compression";
import cors from "cors";
import express from "express";
import { randomUUID } from "crypto";
import pinoHttp from "pino-http";

import { logger } from "./logger";
import sql from "./db";

// Initialize Sentry before creating the app (no-op if SENTRY_DSN is not set)
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? "development",
  });
}
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { applySecurityHeaders } from "./middleware/security";
import accountingRoutes from "./routes/accounting";
import accountsRoutes from "./routes/accounts";
import auditLogsRoutes from "./routes/auditLogs";
import authRoutes from "./routes/auth";
import receiptSeriesRoutes from "./routes/receiptSeries";
import businessSettingsRoutes from "./routes/businessSettings";
import cartRoutes from "./routes/carts";
import dashboardRoutes from "./routes/dashboard";
import employeesRoutes from "./routes/employees";
import invoicesRoutes from "./routes/invoices";
import membersRoute from "./routes/members";
import payrollRoutes from "./routes/payroll";
import productRoutes from "./routes/products";
import receiptSettingsRoutes from "./routes/receiptSettings";
import rentalRoutes from "./routes/rentals";
import reportsRoutes from "./routes/reports";
import salesRoutes from "./routes/sales";
import usersRoutes from "./routes/users";
import vouchersRoutes from "./routes/vouchers";

export function createApp() {
  const app = express();
  const defaultLocalOrigins = [
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:8081",
    "http://127.0.0.1:8081",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ];
  const configuredOrigins = (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowedOrigins = new Set([...defaultLocalOrigins, ...configuredOrigins]);

  app.disable("x-powered-by");

  app.use(compression());
  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: "2mb" }));
  app.use(applySecurityHeaders);

  // Correlation ID — attach a unique request ID to every request/response
  app.use((req, res, next) => {
    const id = (req.headers["x-request-id"] as string) ?? randomUUID();
    (req as express.Request & { id: string }).id = id;
    res.setHeader("X-Request-Id", id);
    next();
  });
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) {
          return callback(null, true);
        }

        return callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
    })
  );

  app.use("/api/auth", authRoutes);
  app.use("/api/business-settings", businessSettingsRoutes);
  app.use("/api/products", productRoutes);
  app.use("/api/categories", productRoutes);
  app.use("/api/sales", salesRoutes);
  app.use("/api/carts", cartRoutes);
  app.use("/api/rental", rentalRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/members", membersRoute);
  app.use("/api/receipt-settings", receiptSettingsRoutes);
  app.use("/api/reports", reportsRoutes);
  app.use("/api/employees", employeesRoutes);
  app.use("/api/payroll", payrollRoutes);
  app.use("/api/vouchers", vouchersRoutes);
  app.use("/api/accounting", accountingRoutes);
  app.use("/api/accounts", accountsRoutes);
  app.use("/api/invoices", invoicesRoutes);
  app.use("/api/users", usersRoutes);
  app.use("/api/audit-logs", auditLogsRoutes);
  app.use("/api/receipt-series", receiptSeriesRoutes);

  app.get("/health", async (_req, res) => {
    try {
      await sql`SELECT 1`;
      return res.json({ ok: true, db: "connected" });
    } catch {
      return res.status(503).json({ ok: false, db: "disconnected" });
    }
  });
  app.use(notFoundHandler);
  // Sentry error handler must come after routes and before the custom errorHandler
  if (process.env.SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(app);
  }
  app.use(errorHandler);

  return app;
}

export default createApp;

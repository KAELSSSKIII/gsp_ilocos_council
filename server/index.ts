import "dotenv/config";

import { logger } from "./logger";
import { startServer } from "./startServer";

// ── Startup environment guards ─────────────────────────────────────────────
if (!process.env.JWT_SECRET) {
  // Use console here — logger may not be initialized if env is missing
  console.error("FATAL: JWT_SECRET environment variable is required");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("FATAL: DATABASE_URL environment variable is required");
  process.exit(1);
}

// ── Unhandled rejection safety net ────────────────────────────────────────
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled rejection");
});

void startServer()
  .then(({ port, close }) => {
    logger.info(`GSP API server running on http://localhost:${port}`);

    // ── Graceful shutdown ────────────────────────────────────────────────
    const shutdown = async () => {
      logger.info("Shutting down server...");
      await close();
      process.exit(0);
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  })
  .catch((error) => {
    logger.error({ err: error }, "Failed to start server");
    process.exit(1);
  });

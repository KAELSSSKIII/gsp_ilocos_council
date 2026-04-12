import "dotenv/config";

import { startServer } from "./startServer";

// ── Startup environment guards ─────────────────────────────────────────────
if (!process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET environment variable is required");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("FATAL: DATABASE_URL environment variable is required");
  process.exit(1);
}

// ── Unhandled rejection safety net ────────────────────────────────────────
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

void startServer()
  .then(({ port, close }) => {
    console.log(`GSP API server running on http://localhost:${port}`);

    // ── Graceful shutdown ────────────────────────────────────────────────
    const shutdown = async () => {
      console.log("Shutting down server...");
      await close();
      process.exit(0);
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  })
  .catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });

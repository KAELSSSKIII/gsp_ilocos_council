import type { Server } from "node:http";

import { ensureAccountingFoundation } from "./bootstrapAccountingFoundation";
import { createApp } from "./app";

export type StartedServer = {
  close: () => Promise<void>;
  port: number;
  server: Server;
};

export async function startServer(port = parseInt(process.env.PORT ?? "3001", 10)): Promise<StartedServer> {
  await ensureAccountingFoundation();

  const app = createApp();
  const server = await new Promise<Server>((resolve) => {
    const activeServer = app.listen(port, () => resolve(activeServer));
  });
  const address = server.address();
  const resolvedPort = typeof address === "object" && address ? address.port : port;

  return {
    server,
    port: resolvedPort,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  };
}

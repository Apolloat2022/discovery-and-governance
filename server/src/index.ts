import { buildApp } from "./app.js";
import { openDb } from "./db.js";

const PORT = Number(process.env.PORT ?? 4100);

const db = openDb();
const app = buildApp(db, { logger: true });

try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
  app.log.info(`Prism API listening on http://localhost:${PORT}/api`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void app.close().then(() => {
      db.close();
      process.exit(0);
    });
  });
}

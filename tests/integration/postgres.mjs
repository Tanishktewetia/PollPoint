import EmbeddedPostgres from "embedded-postgres";
import { mkdir, mkdtemp } from "node:fs/promises";
import { resolve, join, sep } from "node:path";
import { createServer } from "node:net";
import { initializeDatabase } from "../database/harness.mjs";

export async function startPostgres() {
  const root = resolve(".test-databases");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, "pg-"));
  // The embedded server removes only this new, checked test directory on stop.
  if (!resolve(directory).startsWith(root + sep))
    throw new Error("Invalid test database directory");
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const pg = new EmbeddedPostgres({
    databaseDir: directory,
    port,
    user: "postgres",
    password: "local-test-only",
    persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    postgresFlags: ["-h", "127.0.0.1"],
    onLog: () => {},
    onError: () => {},
  });
  await pg.initialise();
  await pg.start();
  const connections = new Set();
  async function connect() {
    const client = pg.getPgClient("postgres", "127.0.0.1");
    await client.connect();
    connections.add(client);
    client.once("end", () => connections.delete(client));
    client.exec = (sql) => client.query(sql);
    return client;
  }
  const db = await connect();
  try {
    await initializeDatabase(db);
  } catch (error) {
    await db.end();
    await pg.stop();
    throw error;
  }
  return {
    db,
    connect,
    async close() {
      await Promise.all([...connections].map((c) => c.end()));
      await pg.stop();
    },
  };
}

import postgres from "postgres";

type DbTypes = Record<string, unknown>;

export type SqlClient = postgres.Sql<DbTypes>;
export type TransactionClient = postgres.TransactionSql<DbTypes>;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const sql: SqlClient = postgres(process.env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  // Prevent runaway queries from blocking the connection pool indefinitely.
  // Any single query that takes longer than 30 seconds is killed automatically.
  connection: {
    statement_timeout: 30_000,
  },
});

export const asSqlClient = (client: SqlClient | TransactionClient): SqlClient =>
  client as unknown as SqlClient;

export default sql;

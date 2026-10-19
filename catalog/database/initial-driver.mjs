export const initialAdapter = async (provider, credentials) => {
  if (provider === "turso") {
    const { connect } = await import("@tursodatabase/serverless");
    const client = connect({
      url: credentials.TURSO_DATABASE_URL,
      authToken: credentials.TURSO_AUTH_TOKEN,
      defaultQueryTimeout: 15_000,
    });
    const query = (sql, args = []) => client.all(sql, ...args);
    return {
      query,
      transaction: async (action) => {
        await query("BEGIN IMMEDIATE");
        try {
          const result = await action(query);
          await query("COMMIT");
          return result;
        } catch (error) {
          await query("ROLLBACK").catch(() => {
            /* Keep provider diagnostics private, including cleanup failures. */
          });
          throw error;
        }
      },
      close: () => client.close(),
    };
  }
  const { Client } = await import("pg");
  const url = new URL(credentials.DATABASE_URL_DIRECT);
  const client = new Client({
    host: url.hostname,
    port: Number(url.port),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 8000,
    query_timeout: 15_000,
    statement_timeout: 15_000,
    lock_timeout: 8000,
  });
  client.on("error", () => {
    /* Keep provider diagnostics private, including cleanup failures. */
  });
  try {
    await client.connect();
  } catch (error) {
    await client.end().catch(() => {
      /* Keep provider diagnostics private, including cleanup failures. */
    });
    throw error;
  }
  const query = async (sql, args = []) => {
    const result = await client.query(sql, args);
    return result.rows;
  };
  return {
    query,
    transaction: async (action) => {
      await query("BEGIN");
      try {
        await query("SELECT pg_advisory_xact_lock(1684631158, 1)");
        await query("SET LOCAL search_path TO public");
        const result = await action(query);
        await query("COMMIT");
        return result;
      } catch (error) {
        await query("ROLLBACK").catch(() => {
          /* Keep provider diagnostics private, including cleanup failures. */
        });
        throw error;
      }
    },
    close: () => client.end(),
  };
};

import { createHash } from "node:crypto";

// Preserve SQL string literals exactly; normalize only identifiers/spacing.
export const normalizeSql = (value) =>
  (String(value ?? "").match(/'(?:''|[^'])*'|[^']+/gu) ?? [])
    .map((part) =>
      part.startsWith("'")
        ? part
        : part
            .replaceAll(/["`]/gu, "")
            .replaceAll(/\bpublic\./gu, "")
            .replaceAll(/\s+/gu, "")
            .replaceAll(/;+$/gu, "")
    )
    .join("");
// Schema records have semantic keys. Formatters and database drivers can emit
// identical properties in different insertion orders; compare canonical records.
const canonical = (value) => {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonical(entry)])
    );
  }
  return value;
};
const sorted = (values) =>
  values
    .map(canonical)
    .toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
const equal = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const quoted = (value) => `"${value.replaceAll('"', '""')}"`;

// SQLite and Turso serialize default expressions differently. Preserve literal
// case and parentheses inside expressions; remove only whole-expression wrappers.
const sqliteDefault = (value) => {
  let normalized = (normalizeSql(value).match(/'(?:''|[^'])*'|[^']+/gu) ?? [])
    .map((part) => (part.startsWith("'") ? part : part.toLowerCase()))
    .join("");
  while (normalized.startsWith("(") && normalized.endsWith(")")) {
    const tokens = normalized.match(/'(?:''|[^'])*'|[\s\S]/gu) ?? [];
    let depth = 0;
    const enclosed = tokens.every((token, index) => {
      if (token === "(") {
        depth += 1;
      }
      if (token === ")") {
        depth -= 1;
      }
      return index === tokens.length - 1 ? depth === 0 : depth > 0;
    });
    if (!enclosed) {
      break;
    }
    normalized = normalized.slice(1, -1);
  }
  return normalized;
};

export const inspectSchema = async (query, provider) => {
  if (provider === "turso") {
    const objects = await query(
      "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE substr(name,1,7) != 'sqlite_' AND NOT (name = '__drizzle_migrations' AND type = 'table') ORDER BY name"
    );
    const schema = [];
    for (const object of objects) {
      // Turso's engine-owned MVCC table is not application data. Ignore only
      // this exact definition, not an arbitrary internal-looking table name.
      // https://github.com/tursodatabase/turso/blob/main/core/mvcc/database/mod.rs
      if (
        object.type === "table" &&
        object.name === "__turso_internal_mvcc_meta" &&
        normalizeSql(object.sql).toLowerCase() ===
          "createtable__turso_internal_mvcc_meta(ktext,vintegernotnull)"
      ) {
        continue;
      }
      if (object.type === "index") {
        continue;
      }
      if (object.type !== "table") {
        schema.push({
          type: object.type,
          name: object.name,
          sql: normalizeSql(object.sql),
        });
        continue;
      }
      // eslint-disable-next-line no-await-in-loop -- The remote connection owns a single stream.
      const columns = await query(`PRAGMA table_xinfo(${quoted(object.name)})`);
      // eslint-disable-next-line no-await-in-loop -- Inspect on the locked transaction stream.
      const foreignKeys = await query(
        `PRAGMA foreign_key_list(${quoted(object.name)})`
      );
      // eslint-disable-next-line no-await-in-loop -- Inspect on the locked transaction stream.
      const indexes = await query(`PRAGMA index_list(${quoted(object.name)})`);
      const indexDefinitions = [];
      for (const index of indexes) {
        // eslint-disable-next-line no-await-in-loop -- Inspect on the locked transaction stream.
        const fields = await query(`PRAGMA index_xinfo(${quoted(index.name)})`);
        indexDefinitions.push({
          name: index.origin === "c" ? index.name.toLowerCase() : index.origin,
          unique: Number(index.unique),
          partial: Number(index.partial),
          fields: fields.map((field) => ({
            coll: field.coll?.toLowerCase(),
            desc: Number(field.desc),
            key: Number(field.key),
            name:
              Number(field.cid) === -1
                ? null
                : (field.name?.toLowerCase() ?? null),
          })),
        });
      }
      schema.push({
        type: "table",
        name: object.name.toLowerCase(),
        columns: columns.map((column) => ({
          default:
            column.dflt_value === null
              ? null
              : sqliteDefault(column.dflt_value),
          hidden: Number(column.hidden),
          name: column.name.toLowerCase(),
          notNull: Number(column.notnull),
          primary: Number(column.pk),
          type: column.type.toLowerCase(),
        })),
        foreignKeys: sorted(
          foreignKeys.map((foreign) => ({
            from: foreign.from.toLowerCase(),
            match: foreign.match.toLowerCase(),
            onDelete: foreign.on_delete.toLowerCase(),
            onUpdate: foreign.on_update.toLowerCase(),
            table: foreign.table.toLowerCase(),
            to: foreign.to.toLowerCase(),
          }))
        ),
        indexes: sorted(indexDefinitions),
        unsupported: /\b(?:CHECK|COLLATE|STRICT)\b|WITHOUT\s+ROWID/iu.test(
          object.sql
        ),
      });
    }
    return schema;
  }
  const objects = await query(`
    SELECT 'table' AS kind, c.relname AS name,
      c.relkind::text || ':' || c.relrowsecurity::text || ':' || c.relforcerowsecurity::text AS definition
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema','drizzle') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%' AND c.relkind != 'i'
    UNION ALL
    SELECT 'history-object', c.relname, c.relkind::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='drizzle' AND c.relname NOT IN ('__drizzle_migrations','__drizzle_migrations_id_seq','__drizzle_migrations_pkey')
    UNION ALL
    SELECT 'column', c.relname || '.' || a.attname,
      format_type(a.atttypid,a.atttypmod) || ':' || a.attnotnull::text || ':' || coalesce(pg_get_expr(d.adbin,d.adrelid),'') || ':' || a.attidentity::text || ':' || a.attgenerated::text
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped
    UNION ALL
    SELECT 'constraint', c.relname || '.' || con.conname, pg_get_constraintdef(con.oid)
    FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND con.contype != 'n'
    UNION ALL
    SELECT 'index', indexname, indexdef FROM pg_indexes WHERE schemaname='public'
    UNION ALL
    SELECT 'trigger', t.tgname, pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal
    UNION ALL
    SELECT 'policy', policyname, tablename FROM pg_policies WHERE schemaname='public'
    UNION ALL
    SELECT 'type', t.typname, t.typtype::text FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype IN ('e','d')
    UNION ALL
    SELECT 'routine', p.proname, n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
  `);
  return objects.map((object) => ({
    ...object,
    definition:
      object.kind === "column"
        ? object.definition.replaceAll(/\s+/gu, " ")
        : normalizeSql(object.definition),
  }));
};

export const initialSchema = async (provider, migration, snapshot) => {
  if (provider === "turso") {
    const { DatabaseSync } = await import("node:sqlite");
    const shadow = new DatabaseSync(":memory:");
    try {
      for (const statement of migration.sql) {
        shadow.exec(statement);
      }
      return await inspectSchema((sql) => shadow.prepare(sql).all(), provider);
    } finally {
      shadow.close();
    }
  }
  const expected = [];
  for (const table of Object.values(snapshot.tables)) {
    const { name } = table;
    expected.push({ kind: "table", name, definition: "r:false:false" });
    for (const column of Object.values(table.columns)) {
      expected.push({
        kind: "column",
        name: `${name}.${column.name}`,
        definition: `${column.type.replace("timestamp", "timestamp without time zone")}:${column.notNull}:${normalizeSql(column.default)}::`,
      });
      if (column.primaryKey) {
        expected.push(
          {
            kind: "constraint",
            name: `${name}.${name}_pkey`,
            definition: normalizeSql(`PRIMARY KEY (${column.name})`),
          },
          {
            kind: "index",
            name: `${name}_pkey`,
            definition: normalizeSql(
              `CREATE UNIQUE INDEX ${name}_pkey ON public.${name} USING btree (${column.name})`
            ),
          }
        );
      }
    }
    for (const constraint of Object.values(table.uniqueConstraints)) {
      expected.push(
        {
          kind: "constraint",
          name: `${name}.${constraint.name}`,
          definition: normalizeSql(`UNIQUE (${constraint.columns.join(",")})`),
        },
        {
          kind: "index",
          name: constraint.name,
          definition: normalizeSql(
            `CREATE UNIQUE INDEX ${constraint.name} ON public.${name} USING btree (${constraint.columns.join(",")})`
          ),
        }
      );
    }
    for (const foreign of Object.values(table.foreignKeys)) {
      expected.push({
        kind: "constraint",
        name: `${name}.${foreign.name}`,
        definition: normalizeSql(
          `FOREIGN KEY (${foreign.columnsFrom.join(",")}) REFERENCES ${foreign.tableTo}(${foreign.columnsTo.join(",")})${foreign.onDelete === "cascade" ? " ON DELETE CASCADE" : ""}`
        ),
      });
    }
    for (const index of Object.values(table.indexes)) {
      expected.push({
        kind: "index",
        name: index.name,
        definition: normalizeSql(
          `CREATE ${index.isUnique ? "UNIQUE " : ""}INDEX ${index.name} ON public.${name} USING ${index.method} (${index.columns.map((column) => column.expression).join(",")})`
        ),
      });
    }
  }
  return expected;
};

const historyTable = (provider) =>
  provider === "turso"
    ? '"__drizzle_migrations"'
    : '"drizzle"."__drizzle_migrations"';

const validHistoryShape = async (query, provider) => {
  if (provider === "turso") {
    const columns = await query('PRAGMA table_xinfo("__drizzle_migrations")');
    const expected = [
      { name: "id", type: "integer", notNull: 0, primary: 1 },
      { name: "hash", type: "text", notNull: 1, primary: 0 },
      { name: "created_at", type: "numeric", notNull: 0, primary: 0 },
      { name: "name", type: "text", notNull: 0, primary: 0 },
      { name: "applied_at", type: "text", notNull: 0, primary: 0 },
    ];
    return (
      columns.every(
        (column) => column.dflt_value === null && Number(column.hidden) === 0
      ) &&
      equal(
        columns.map((column) => ({
          name: column.name,
          type: column.type.toLowerCase(),
          notNull: Number(column.notnull),
          primary: Number(column.pk),
        })),
        expected
      )
    );
  }
  const columns = await query(
    "SELECT column_name AS name, data_type AS type, is_nullable AS nullable, column_default AS default FROM information_schema.columns WHERE table_schema='drizzle' AND table_name='__drizzle_migrations'"
  );
  return equal(columns, [
    {
      name: "id",
      type: "integer",
      nullable: "NO",
      default: "nextval('drizzle.__drizzle_migrations_id_seq'::regclass)",
    },
    { name: "hash", type: "text", nullable: "NO", default: null },
    { name: "created_at", type: "bigint", nullable: "YES", default: null },
  ]);
};

export const inspectInitialDatabase = async (query, provider, initial) => {
  const schema = await inspectSchema(query, provider);
  const historyObjects = await query(
    provider === "turso"
      ? "SELECT name FROM sqlite_master WHERE name='__drizzle_migrations' AND type='table'"
      : "SELECT to_regclass('drizzle.__drizzle_migrations') AS name"
  );
  const historyExists =
    provider === "turso"
      ? historyObjects.length > 0
      : Boolean(historyObjects[0]?.name);
  if (historyExists && !(await validHistoryShape(query, provider))) {
    return "incompatible";
  }
  const history = historyExists
    ? await query(
        `SELECT hash, created_at${provider === "turso" ? ", name" : ""} FROM ${historyTable(provider)}`
      )
    : [];
  if (schema.length === 0 && history.length === 0) {
    return "empty";
  }
  const applied =
    history.length === 1 &&
    history[0].hash === initial.hash &&
    Number(history[0].created_at) === initial.folderMillis &&
    (provider !== "turso" || history[0].name === initial.name);
  return applied && equal(schema, initial.schema) ? "ready" : "incompatible";
};

export const verifyInitialAuthSchema = async (query, provider, initial) => {
  if (!equal(await inspectSchema(query, provider), initial.schema)) {
    return false;
  }
  for (const table of ["user", "account", "session", "verification"]) {
    // eslint-disable-next-line no-await-in-loop -- The Turso connection serializes one stream.
    await query(`SELECT * FROM ${quoted(table)} LIMIT 0`);
  }
  return true;
};

// The lock and the inspection share the same transaction/connection. DDL and
// the genuine Drizzle history entry commit together; never baseline existing data.
export const initializeInitialDatabase = async (
  adapter,
  provider,
  initial,
  migration
) => {
  let connected = false;
  try {
    await adapter.query("SELECT 1");
    connected = true;
    const state = await adapter.transaction(async (query) => {
      const before = await inspectInitialDatabase(query, provider, initial);
      if (before !== "empty") {
        return before;
      }
      if (provider === "turso") {
        await query(
          'CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (id INTEGER PRIMARY KEY, hash text NOT NULL, created_at numeric, name text, applied_at TEXT)'
        );
      } else {
        await query('CREATE SCHEMA IF NOT EXISTS "drizzle"');
        await query(
          'CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)'
        );
      }
      for (const sql of migration.sql) {
        // eslint-disable-next-line no-await-in-loop -- DDL order and history must share the locked transaction.
        await query(sql);
      }
      // eslint-disable-next-line unicorn/prefer-ternary -- Keep provider history formats explicit for review.
      if (provider === "turso") {
        await query(
          `INSERT INTO ${historyTable(provider)} (hash, created_at, name, applied_at) VALUES (?, ?, ?, ?)`,
          [
            initial.hash,
            initial.folderMillis,
            initial.name,
            new Date().toISOString(),
          ]
        );
      } else {
        await query(
          `INSERT INTO ${historyTable(provider)} (hash, created_at) VALUES ($1, $2)`,
          [initial.hash, initial.folderMillis]
        );
      }
      if (
        (await inspectInitialDatabase(query, provider, initial)) !== "ready"
      ) {
        throw new Error("Schema verification failed.");
      }
      return "initialized";
    });
    if (state === "incompatible") {
      return { connected, status: "incompatible" };
    }
    // Check again after commit, including on an idempotent retry.
    if (
      (await inspectInitialDatabase(adapter.query, provider, initial)) !==
      "ready"
    ) {
      throw new Error("Post-commit verification failed.");
    }
    // Check auth readability separately from migration-history permissions.
    if (!(await verifyInitialAuthSchema(adapter.query, provider, initial))) {
      throw new Error("Auth schema verification failed.");
    }
    return {
      connected,
      status: state === "initialized" ? "initialized" : "ready",
    };
  } catch {
    // Drivers can embed SQL, tokens or URLs. Only return fixed status values.
    return { connected, status: "failed" };
  } finally {
    await adapter.close().catch(() => {
      /* Cleanup cannot expose driver errors. */
    });
  }
};

export const migrationDigest = (migration) =>
  createHash("sha256")
    .update(migration.sql.join("--> statement-breakpoint"))
    .digest("hex");

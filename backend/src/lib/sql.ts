import { neon } from "@neondatabase/serverless"

import { config } from "../config.js"

// The SQL the data store needs, as one function: Neon's serverless driver
// on Vercel (it speaks HTTP, so there is no connection pool to keep), an
// in-process Postgres (PGlite) in tests. Without DATABASE_URL there is
// none, and the data stays in the JSON file.
export type Sql = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>

let current: Sql | null | undefined
let tables: Promise<void> | undefined

export function databaseSql(): Sql | undefined {
  if (current === undefined) {
    const run = config.databaseUrl ? neon(config.databaseUrl) : undefined
    current = run ? (text, params = []) => run.query(text, params) : null
  }
  return current ?? undefined
}

// Tests hand in their own database, or null for the JSON file.
export function useSql(sql: Sql | null) {
  current = sql
  tables = undefined
}

// The store's tables, made the first time they are needed: the data as one
// JSON document with the version each write moves on, hourly copies, and
// agreement photos.
export function ensureTables(sql: Sql) {
  tables ??= (async () => {
    await sql(
      "create table if not exists uniconnect_store (id smallint primary key, data text not null, version integer not null, saved_at timestamptz not null default now())",
    )
    await sql("create table if not exists uniconnect_backups (taken_at timestamptz primary key, data text not null)")
    await sql(
      "create table if not exists uniconnect_photos (agreement_id text not null, name text not null, data text not null, primary key (agreement_id, name))",
    )
  })().catch((error: unknown) => {
    tables = undefined
    throw error
  })
  return tables
}

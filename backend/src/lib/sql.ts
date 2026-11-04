import { neon } from "@neondatabase/serverless"

import { config } from "../config.js"

// 데이터 저장소가 필요로 하는 SQL을 함수 하나로 둔다. Vercel에서는 Neon의
// 서버리스 드라이버(HTTP라 연결 풀을 둘 필요가 없다), 테스트에서는 인프로세스
// Postgres(PGlite)를 쓴다. DATABASE_URL이 없으면 둘 다 없고 데이터는 JSON
// 파일에 남는다.
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

// 테스트는 자기 데이터베이스를 넘기거나, JSON 파일이면 null을 넘긴다.
export function useSql(sql: Sql | null) {
  current = sql
  tables = undefined
}

// 동시에 뜨는 API 복사본(Vercel은 요청이 몰리면 여러 개를 띄운다)이 모두
// 테이블을 만든다. "if not exists"로는 이 경쟁이 정리되지 않는다. 진 복사본은
// Postgres 카탈로그에서 중복 키(23505)나 이미 있는 테이블(42P07) 오류를
// 받는데, 그 시점에 테이블은 이미 있으므로 문장을 한 번 더 돌려 찾게 한다.
async function createTable(sql: Sql, text: string) {
  try {
    await sql(text)
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code
    if (code !== "23505" && code !== "42P07") throw error
    await sql(text)
  }
}

// 처음 필요할 때 만드는 저장소의 테이블: 쓸 때마다 올라가는 버전이 붙은
// JSON 문서 하나의 데이터, 시간별 복사본, 계약서 사진, 운영자용 최근 오류,
// 모든 복사본이 공유하는 한도 카운트(lib/rateLimit.ts).
export function ensureTables(sql: Sql) {
  tables ??= (async () => {
    await createTable(
      sql,
      "create table if not exists uniconnect_store (id smallint primary key, data text not null, version integer not null, saved_at timestamptz not null default now())",
    )
    await createTable(sql, "create table if not exists uniconnect_backups (taken_at timestamptz primary key, data text not null)")
    await createTable(
      sql,
      "create table if not exists uniconnect_photos (agreement_id text not null, name text not null, data text not null, primary key (agreement_id, name))",
    )
    await createTable(
      sql,
      "create table if not exists uniconnect_errors (id text primary key, at timestamptz not null, entry text not null)",
    )
    await createTable(
      sql,
      "create table if not exists uniconnect_limits (name text not null, key text not null, count integer not null, reset_at bigint not null, primary key (name, key))",
    )
  })().catch((error: unknown) => {
    tables = undefined
    throw error
  })
  return tables
}

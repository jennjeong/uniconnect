import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { after, test } from "node:test"

import { PGlite } from "@electric-sql/pglite"

// The data store on Postgres, as on Vercel, with an in-process database
// standing in for Neon: seeding once, writes that build on the version they
// read, another copy's writes coming in, hourly copies, and photos as rows.
const dataDir = await mkdtemp(path.join(tmpdir(), "uniconnect-pg-"))
// Where the JSON file would go; with a database it is never written.
process.env.DATA_FILE = path.join(dataDir, "db.json")

const db = new PGlite()
const sql = async (text: string, params: unknown[] = []) => (await db.query<Record<string, unknown>>(text, params)).rows
const { useSql } = await import("./lib/sql.js")
useSql(sql)
const store = await import("./store.js")
const { photos } = await import("./lib/photos.js")

after(async () => {
  await db.close()
  await rm(dataDir, { recursive: true, force: true })
})

const stored = async () => {
  const [row] = await sql("select data, version from uniconnect_store where id = 1")
  type Data = { proposals: Record<string, string[]>; agreements: { items: { photos: string[] }[] }[] }
  return { data: JSON.parse(String(row.data)) as Data, version: Number(row.version) }
}

// Another copy of the API writes behind this one's back.
async function writeAsAnotherCopy(change: (data: { proposals: Record<string, string[]> }) => void) {
  const { data } = await stored()
  change(data)
  await sql("update uniconnect_store set data = $1, version = version + 1 where id = 1", [JSON.stringify(data)])
}

test("the first copy seeds the database, and a later one reads it", async () => {
  const database = await store.loadDatabase()
  assert.ok(database.accounts.length > 0)
  assert.equal((await stored()).version, 1)
  assert.equal(existsSync(process.env.DATA_FILE!), false)
  // A copy starting now finds the data and keeps the version.
  await store.loadDatabase()
  assert.equal((await stored()).version, 1)
})

test("each save moves the version on", async () => {
  store.getDatabase().proposals["copy-a"] = ["afternoon-coffee"]
  await store.saveDatabase()
  const after = await stored()
  assert.equal(after.version, 2)
  assert.deepEqual(after.data.proposals["copy-a"], ["afternoon-coffee"])
})

test("another copy's save comes in on the next request", async () => {
  await writeAsAnotherCopy((data) => {
    data.proposals["copy-b"] = ["moment-studio"]
  })
  store.freshness.everyMs = 0
  await store.refreshDatabase()
  assert.deepEqual(store.getDatabase().proposals["copy-b"], ["moment-studio"])
})

test("a save over an older version is undone, the newer data comes in, and saving again works", async () => {
  await writeAsAnotherCopy((data) => {
    data.proposals["late"] = ["brewing-lab"]
  })
  // This copy saves without having looked.
  store.getDatabase().proposals["mine"] = ["glowlab"]
  await assert.rejects(store.saveDatabase(), (error: { status?: number }) => error.status === 503)
  assert.equal(store.getDatabase().proposals["mine"], undefined)
  assert.deepEqual(store.getDatabase().proposals["late"], ["brewing-lab"])

  store.getDatabase().proposals["mine"] = ["glowlab"]
  await store.saveDatabase()
  const after = await stored()
  assert.deepEqual([after.data.proposals["late"], after.data.proposals["mine"]], [["brewing-lab"], ["glowlab"]])
})

test("an hourly copy is kept, the latest 24", async () => {
  for (let hour = 0; hour < 25; hour += 1) {
    await sql("insert into uniconnect_backups (taken_at, data) values ($1, '{}')", [new Date(Date.UTC(2000, 0, 1, hour)).toISOString()])
  }
  store.backups.lastAt = 0
  await store.saveDatabase()
  const rows = await sql("select taken_at, data from uniconnect_backups order by taken_at")
  assert.equal(rows.length, 24)
  assert.equal(new Date(rows[0].taken_at as string).toISOString(), "2000-01-01T02:00:00.000Z")
  assert.ok(String(rows.at(-1)!.data).includes("accounts"))
})

test("agreement photos are rows that go with their agreement", async () => {
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3])
  await photos().put("agreement-1", "a.png", bytes)
  await photos().put("agreement-1", "b.png", bytes)
  await photos().put("agreement-2", "c.png", bytes)
  assert.deepEqual(await photos().get("agreement-1", "a.png"), bytes)
  await photos().remove("agreement-1", ["a.png"])
  assert.equal(await photos().get("agreement-1", "a.png"), undefined)
  await photos().removeAll(["agreement-1", "agreement-2"])
  const [{ count }] = await sql("select count(*)::int as count from uniconnect_photos")
  assert.equal(count, 0)
  assert.equal(existsSync(path.join(dataDir, "uploads")), false)
})

test("through the API, an agreement photo goes into the database, is served to its sides and goes on deletion", async () => {
  const { createApp } = await import("./app.js")
  const { DEMO_PASSWORD } = await import("./data/seed.js")
  const server = createApp().listen(0)
  await new Promise((resolve) => server.once("listening", resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`
  const count = async () =>
    Number((await sql("select count(*)::int as count from uniconnect_photos where agreement_id = 'req-runners'"))[0].count)
  try {
    const login = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "브랜드", email: "hello@afternoon-coffee.kr", password: DEMO_PASSWORD }),
    })
    const auth = { Authorization: `Bearer ${((await login.json()) as { token: string }).token}` }
    type Item = { id: string; side: string; photos: string[] }
    const opened = (await (await fetch(`${base}/agreements/req-runners`, { headers: auth })).json()) as { agreement: { items: Item[] } }
    const item = opened.agreement.items.find((entry) => entry.side === "brand")!
    const image = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString("base64")}`
    const added = await fetch(`${base}/agreements/req-runners/items/${item.id}/photos`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ image }),
    })
    assert.equal(added.status, 201)
    const photo = ((await added.json()) as { agreement: { items: Item[] } }).agreement.items.find((entry) => entry.id === item.id)!.photos[0]
    assert.equal(await count(), 1)
    const served = await fetch(`${base}/agreements/req-runners/photos/${photo}`, { headers: auth })
    assert.equal(served.status, 200)
    assert.equal(served.headers.get("content-type"), "image/png")
    assert.deepEqual(Buffer.from(await served.arrayBuffer()), Buffer.from(image.split(",")[1], "base64"))
    // The data that names it is in the database too.
    assert.ok((await stored()).data.agreements.some((entry) => entry.items.some((each) => each.photos.includes(photo))))
    const removed = await fetch(`${base}/agreements/req-runners/items/${item.id}/photos/${photo}`, { method: "DELETE", headers: auth })
    assert.equal(removed.status, 200)
    assert.equal(await count(), 0)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

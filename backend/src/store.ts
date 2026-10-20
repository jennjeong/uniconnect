import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"

import { config } from "./config.js"
import { createSeed } from "./data/seed.js"
import type { Database } from "./types.js"

// A JSON file stands in for a database so the prototype runs without any
// extra installs. Routes only touch data through getDatabase/saveDatabase,
// which is the seam to replace when moving to a real database.
let database: Database | undefined
let pendingWrite = Promise.resolve()

export async function loadDatabase() {
  try {
    database = JSON.parse(await readFile(config.dataFile, "utf8")) as Database
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    database = await createSeed()
    await saveDatabase()
  }
  return database
}

export function getDatabase() {
  if (!database) throw new Error("loadDatabase() must run before handling requests")
  return database
}

// Writes are queued and go through a temp file, so a crash mid-write cannot
// leave a half-written db.json behind.
export function saveDatabase() {
  const snapshot = JSON.stringify(getDatabase(), null, 2)
  pendingWrite = pendingWrite.then(async () => {
    await mkdir(path.dirname(config.dataFile), { recursive: true })
    const tempFile = `${config.dataFile}.tmp`
    await writeFile(tempFile, snapshot)
    await rename(tempFile, config.dataFile)
  })
  return pendingWrite
}

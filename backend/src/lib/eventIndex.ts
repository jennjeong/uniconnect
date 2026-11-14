import type { Database, EventItem } from "../types.js"

// 행사 id → 행사. 모든 계정의 캘린더에서 먼저 나온 것이다(Object.values(events).flat().find와
// 같다). 여러 행이나 측정마다 행사를 찾을 때 한 번 만들어 쓴다.
export function eventsById(database: Database) {
  const events = new Map<string, EventItem>()
  for (const list of Object.values(database.events)) for (const event of list) if (!events.has(event.id)) events.set(event.id, event)
  return events
}

// 행사 하나를 찾을 때.
export const findEvent = (database: Database, id: string) => Object.values(database.events).flat().find((event) => event.id === id)

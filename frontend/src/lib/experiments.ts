import { useEffect, useMemo, useState } from "react"

import { api } from "../api"
import { experiments, type ExperimentGoal, type ExperimentKey, type Variant } from "../data/experiments"

// A/B 테스트의 브라우저 쪽(#347). 이 브라우저에만 무작위 번호를 두고, 실험 키와 섞어
// 갈래를 정한다. 그래서 같은 사람은 늘 같은 문구를 보고, 서버는 누가 어느 쪽인지 모른다.
// 서버에는 "이 실험의 이 갈래가 한 번 보였다/가입으로 이어졌다"는 횟수만 보낸다.
// 저장소를 쓸 수 없으면 실험에서 빠지고 늘 A를 본다.

const idKey = "uniconnect-ab-id"
const runningKey = "uniconnect-ab-running"
const seenKey = (key: string) => `uniconnect-ab-seen-${key}`
const doneKey = (key: string) => `uniconnect-ab-done-${key}`

function browserId() {
  try {
    let id = localStorage.getItem(idKey)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(idKey, id)
    }
    return id
  } catch {
    return null
  }
}

// FNV-1a. 갈래를 고르게 나누기만 하면 되므로 암호용 해시가 아니어도 된다.
export function hashOf(text: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function pickVariant(key: ExperimentKey, id: string): Variant {
  const experiment = experiments.find((item) => item.key === key)!
  return experiment.variants[hashOf(`${key}:${id}`) % experiment.variants.length]
}

const send = (key: string, variant: string, event: "seen" | "converted", run: string) =>
  void api.countExperiment(key, variant, event, run).catch(() => undefined)

// 켜진 실험을 이 브라우저에 적어 두어 다음 방문은 첫 그림부터 자기 문구를 보여 준다.
export function rememberRunning(running: Record<string, string>) {
  try {
    localStorage.setItem(runningKey, JSON.stringify(running))
  } catch {
    // 저장소가 없으면 실험에 들지 않는다.
  }
}

export function rememberedRunning(): Record<string, string> | undefined {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(runningKey) ?? "null")
    return saved && typeof saved === "object" ? (saved as Record<string, string>) : undefined
  } catch {
    return undefined
  }
}

// 첫 방문에 켜진 실험을 기다리는 시간. 넘으면 A를 보여 주고 그 방문은 세지 않는다.
const waitMs = 500

// 이 브라우저의 갈래와 보여 줄 준비가 됐는지. 한 번 보여 준 문구는 그 화면에서 바꾸지
// 않는다(바뀌는 것이 보이면 결과가 치우친다). 서버가 지금 그 회차가 켜져 있다고 답한
// 뒤에만, 회차마다 한 번 노출로 센다. 노출로 센 회차만 전환이 될 수 있다.
export function useExperiment(key: ExperimentKey, live: Readonly<Record<string, string>> | undefined): { variant: Variant; ready: boolean } {
  const [shown, setShown] = useState<{ run?: string } | undefined>(() => {
    if (!browserId()) return {}
    const running = live ?? rememberedRunning()
    return running && { run: running[key] }
  })
  useEffect(() => {
    if (shown) return
    if (live) {
      setShown({ run: live[key] })
      return
    }
    const timer = window.setTimeout(() => setShown({}), waitMs)
    return () => window.clearTimeout(timer)
  }, [key, live, shown])
  const run = shown?.run
  const variant = useMemo<Variant>(() => {
    const id = run ? browserId() : null
    return id ? pickVariant(key, id) : "A"
  }, [key, run])
  useEffect(() => {
    if (!run || live?.[key] !== run) return
    const mark = `${run} ${variant}`
    try {
      if (localStorage.getItem(seenKey(key)) === mark) return
      localStorage.setItem(seenKey(key), mark)
    } catch {
      return
    }
    send(key, variant, "seen", run)
  }, [key, live, run, variant])
  return { variant, ready: Boolean(shown) }
}

// 목표(가입, 승인을 기다리는 신청도)를 이뤘을 때 부른다. 이 브라우저가 본 회차마다 한 번씩만 전환으로 센다.
// 서버가 꺼진 실험과 지난 회차를 세지 않으므로 여기서는 묻지 않는다.
export function convertExperiments(goal: ExperimentGoal) {
  for (const experiment of experiments) {
    if (experiment.goal !== goal) continue
    try {
      const mark = localStorage.getItem(seenKey(experiment.key))
      const [run, variant] = mark?.split(" ") ?? []
      if (!mark || !run || !variant || localStorage.getItem(doneKey(experiment.key)) === mark) continue
      localStorage.setItem(doneKey(experiment.key), mark)
      send(experiment.key, variant, "converted", run)
    } catch {
      // 저장소가 없으면 실험에 들지 않았다.
    }
  }
}

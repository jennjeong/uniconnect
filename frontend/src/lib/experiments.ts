import { useEffect, useMemo } from "react"

import { api } from "../api"
import { experiments, type ExperimentGoal, type ExperimentKey, type Variant } from "../data/experiments"

// A/B 테스트의 브라우저 쪽(#347). 이 브라우저에만 무작위 번호를 두고, 실험 키와 섞어
// 갈래를 정한다. 그래서 같은 사람은 늘 같은 문구를 보고, 서버는 누가 어느 쪽인지 모른다.
// 서버에는 "이 실험의 이 갈래가 한 번 보였다/가입으로 이어졌다"는 횟수만 보낸다.
// 저장소를 쓸 수 없으면 실험에서 빠지고 늘 A를 본다.

const idKey = "uniconnect-ab-id"
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

// 켜진 실험이면 이 브라우저의 갈래를, 아니면 A를 돌려준다. 회차마다 처음 보일 때 한 번만
// 노출로 세고, 본 회차와 갈래를 적어 둔다(숫자를 지우면 회차가 바뀌어 다시 센다).
export function useExperiment(key: ExperimentKey, running: Readonly<Record<string, string>> | undefined): Variant {
  const run = running?.[key]
  const variant = useMemo<Variant>(() => {
    if (!run) return "A"
    const id = browserId()
    return id ? pickVariant(key, id) : "A"
  }, [key, run])
  useEffect(() => {
    if (!run || !browserId()) return
    const mark = `${run} ${variant}`
    try {
      if (localStorage.getItem(seenKey(key)) === mark) return
      localStorage.setItem(seenKey(key), mark)
    } catch {
      return
    }
    send(key, variant, "seen", run)
  }, [key, run, variant])
  return variant
}

// 목표(가입)를 이뤘을 때 부른다. 이 브라우저가 본 회차마다 한 번씩만 전환으로 센다.
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

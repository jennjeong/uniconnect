// A/B 테스트 목록(#347). backend/src/lib/experiments.ts의 experimentList와 같아야 한다
// (lib/lists.sync.test.ts가 확인). 갈래마다 보여 줄 문구는 쓰는 화면이 정한다.
export const experiments = [{ key: "landing-entry", goal: "sign_up", variants: ["A", "B"] }] as const

export type ExperimentKey = (typeof experiments)[number]["key"]
export type ExperimentGoal = (typeof experiments)[number]["goal"]
export type Variant = (typeof experiments)[number]["variants"][number]

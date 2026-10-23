// Chains whose logo uniconnect carries (data/franchises.ts), with how a
// branch's name starts on Kakao ("CU 삼육대생활관점", "이디야커피 삼육대점").
export type Franchise = "gs25" | "cu" | "seven-eleven" | "emart24" | "mammoth" | "mega-mgc" | "ediya" | "compose"

const prefixes: [Franchise, RegExp][] = [
  ["gs25", /^GS25/i],
  ["cu", /^CU(\s|$)/],
  ["seven-eleven", /^세븐일레븐/],
  ["emart24", /^이마트24/],
  ["mammoth", /^매머드(익스프레스|커피)/],
  ["mega-mgc", /^메가(MGC)?커피/],
  ["ediya", /^이디야/],
  ["compose", /^컴포즈커피/],
]

// The chain a shop is a branch of, by how its name starts.
export function franchiseOf(name: string): Franchise | undefined {
  return prefixes.find(([, pattern]) => pattern.test(name.trim()))?.[0]
}

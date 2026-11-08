// 긴 양식의 초안. 이 브라우저에 계정과 양식마다(새 행사, 어떤 행사의 수정, 어떤
// 행사의 복제) 따로 두어 다른 계정이나 다른 행사의 초안이 섞이지 않는다. 새로고침,
// 실수로 다른 화면에 다녀오기, 탭을 닫았다 다시 열기에도 남고, 등록이나 저장에
// 성공하면 지운다. 비밀번호 · PIN · 토큰 같은 값은 넣지 않는다(행사 양식에는 없다).
// 저장소를 쓸 수 없는 브라우저에서는 조용히 아무것도 하지 않는다.

const prefix = "uniconnect-draft:"
// 오래된 초안은 다시 열어도 쓸모가 없다. 30일이 지나면 버린다.
const maxAgeMs = 30 * 24 * 60 * 60 * 1000

export type Draft<T> = { savedAt: string; data: T }

export const draftKey = (accountId: string, form: string) => `${prefix}${accountId}:${form}`

export function loadDraft<T>(key: string, now = Date.now()): Draft<T> | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const draft = JSON.parse(raw) as Draft<T>
    if (!draft?.savedAt || now - Date.parse(draft.savedAt) > maxAgeMs) {
      localStorage.removeItem(key)
      return null
    }
    return draft
  } catch {
    return null
  }
}

export function saveDraft<T>(key: string, data: T, now = new Date()): string | null {
  try {
    const savedAt = now.toISOString()
    localStorage.setItem(key, JSON.stringify({ savedAt, data } satisfies Draft<T>))
    return savedAt
  } catch {
    return null
  }
}

export function clearDraft(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    // 저장소를 쓸 수 없으면 지울 것도 없다.
  }
}

// 로그아웃 때마다 하나씩 는다. 열려 있던 양식이 내려가며 기다리던 초안을 저장할 때,
// 그 사이에 초안을 지웠다면(로그아웃) 다시 쓰지 않게 비교한다.
let generation = 0
export const draftGeneration = () => generation

// 로그아웃할 때 그 계정의 초안을 모두 지운다(같은 기기의 다음 사람이 보지 않게).
export function clearDraftsOf(accountId: string) {
  generation += 1
  try {
    const mine = `${prefix}${accountId}:`
    for (const key of Object.keys(localStorage)) if (key.startsWith(mine)) localStorage.removeItem(key)
  } catch {
    // 저장소를 쓸 수 없으면 지울 것도 없다.
  }
}

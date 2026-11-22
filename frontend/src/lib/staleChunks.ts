// 새로 배포하면 오래 열려 있던 탭은 사라진 이전 화면 파일(청크)을 불러오다 실패한다.
// 그때 한 번만 새로 고쳐 새 배포의 파일을 받게 한다. 같은 실패가 곧바로 되풀이되면
// (네트워크가 끊긴 것 등) 다시 고치지 않고 오류를 그대로 둔다(errorReports가 남긴다).
// 행사 등록 같은 긴 폼은 이 브라우저에 자동 임시 저장되므로 새로 고쳐도 남는다.

const storageKey = "uniconnect:chunk-reload"
// 이 시간 안에 이미 새로 고쳤으면 다시 하지 않는다.
const windowMs = 60_000

export const isChunkLoadError = (error: unknown) =>
  error instanceof Error &&
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(error.message)

// 새로 고쳤으면 true다. 막 새로 고쳤거나 저장소를 쓸 수 없으면 false다.
export function reloadForNewDeploy(now = Date.now(), storage: Pick<Storage, "getItem" | "setItem"> = sessionStorage, reload = () => window.location.reload()) {
  try {
    const last = Number(storage.getItem(storageKey) ?? 0)
    if (now - last < windowMs) return false
    storage.setItem(storageKey, String(now))
  } catch {
    return false
  }
  reload()
  return true
}

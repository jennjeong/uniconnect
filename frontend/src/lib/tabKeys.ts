// 탭 줄의 키보드 이동(WAI-ARIA 탭 패턴). 왼쪽·오른쪽 화살표는 이웃 탭으로, 양 끝에서는
// 반대쪽 끝으로 돈다. Home과 End는 첫 탭과 마지막 탭으로 간다. 다른 키는 null.
export function nextTabIndex(key: string, index: number, count: number): number | null {
  if (count <= 0) return null
  switch (key) {
    case "ArrowRight":
      return (index + 1) % count
    case "ArrowLeft":
      return (index - 1 + count) % count
    case "Home":
      return 0
    case "End":
      return count - 1
    default:
      return null
  }
}

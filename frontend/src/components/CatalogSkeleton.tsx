// 카탈로그를 불러오는 동안 카드 대신 보여 주는 자리표시. 카드와 같은 배치의
// 은색 도형 위로 부드러운 빛 띠가 지나간다.
export function CatalogSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul aria-hidden="true" className="work-grid catalog-skeleton">
      {Array.from({ length: count }, (_, index) => (
        <li key={index}>
          <div className="skeleton-card">
            <span className="skeleton-line short" />
            <span className="skeleton-row">
              <span className="skeleton-mark" />
              <span className="skeleton-lines">
                <span className="skeleton-line" />
                <span className="skeleton-line shorter" />
              </span>
            </span>
            <span className="skeleton-block" />
            <span className="skeleton-pill" />
          </div>
        </li>
      ))}
    </ul>
  )
}

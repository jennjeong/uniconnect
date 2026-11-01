// Stand-ins for the cards while a catalog loads: silver shapes in the cards'
// layout, swept by a soft light band.
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

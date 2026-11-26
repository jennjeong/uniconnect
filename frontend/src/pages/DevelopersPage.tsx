import { useMemo, useState } from "react"

import { PageIntro } from "../components/PageIntro"
import { SearchClear } from "../components/SearchClear"
import { Icon } from "../components/Icon"
import map from "../data/developerMap.json"
import { lang, t, tc } from "../i18n"

type MapNode = (typeof map.nodes)[number]

// 개발자용 구조 지도(/developers): 코드가 어떤 파트로 나뉘고 서로 어떻게 이어지는지
// 사이트의 모양으로 보여 준다. 데이터는 scripts/developer-map.mjs가 코드 구조를 읽어
// 만든 data/developerMap.json이고, 점검 결과는 들어 있지 않다. 웹 사이트 · 서버 ·
// 바깥 서비스 세 줄에서 파트를 고르면 그 파트의 설명, 연결, 파일과 서버 창구가 나온다.
const byId = new Map(map.nodes.map((node) => [node.id, node]))
const childrenOf = (id: string | null) => map.nodes.filter((node) => node.parent === id)
// 고른 파트와 그 안의 모든 파트.
const subtree = (id: string): Set<string> => {
  const ids = new Set([id])
  for (const child of childrenOf(id)) for (const inner of subtree(child.id)) ids.add(inner)
  return ids
}
const topOf = (id: string): MapNode => {
  let node = byId.get(id)!
  while (node.parent) node = byId.get(node.parent)!
  return node
}
// 연결을 보여 줄 때 파트의 이름: 다른 큰 파트 안에 있으면 그 이름을 앞에 붙인다.
const fullLabel = (id: string) => {
  const node = byId.get(id)
  if (!node) return id
  const top = topOf(id)
  return top.id === id ? node.label : `${top.label} · ${node.label}`
}

const lanes = [
  { id: "web", title: "웹 사이트" },
  { id: "api", title: "서버" },
]
const externals = map.nodes.filter((node) => node.kind === "external")
const others = map.nodes.filter((node) => !node.parent && node.kind !== "external" && !lanes.some((lane) => lane.id === node.id))

const linkKinds: Record<string, string> = { import: "코드 사용", http: "서버 요청", other: "그 밖의 연결" }

export function DevelopersPage() {
  const [selected, setSelected] = useState("web")
  const [query, setQuery] = useState("")
  const node = byId.get(selected) ?? map.nodes[0]

  const detail = useMemo(() => {
    const inside = subtree(node.id)
    const files = map.files.filter((file) => inside.has(file.n))
    const routes = map.routes.filter((route) => route.n && inside.has(route.n))
    // 이 파트 바깥과의 연결만, 상대 파트별로 묶는다.
    const group = (direction: "out" | "in") => {
      const totals = new Map<string, { weight: number; kinds: Set<string> }>()
      for (const link of map.links) {
        const mine = direction === "out" ? link.from : link.to
        const other = direction === "out" ? link.to : link.from
        if (!inside.has(mine) || inside.has(other)) continue
        const entry = totals.get(other) ?? { weight: 0, kinds: new Set<string>() }
        entry.weight += link.weight
        entry.kinds.add(link.kind)
        totals.set(other, entry)
      }
      return [...totals].sort((a, b) => b[1].weight - a[1].weight).slice(0, 12)
    }
    return { files, routes, uses: group("out"), usedBy: group("in") }
  }, [node.id])

  const results = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length === 0) return null
    const hit = (...texts: string[]) => {
      const text = texts.join(" ").toLowerCase()
      return words.every((word) => text.includes(word))
    }
    return {
      files: map.files.filter((file) => hit(file.p, file.name, file.d)).slice(0, 30),
      routes: map.routes.filter((route) => hit(route.m, route.p, route.name, route.d)).slice(0, 30),
    }
  }, [query])

  const choose = (id: string | null | undefined) => {
    if (!id || !byId.has(id)) return
    setSelected(id)
    document.getElementById("developers-detail")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const partButton = (item: MapNode, small = false) => (
    <button
      aria-pressed={selected === item.id}
      className={small ? "dev-part small" : "dev-part"}
      key={item.id}
      onClick={() => choose(item.id)}
      type="button"
    >
      <strong>{item.label}</strong>
      {item.files > 0 && <small>{t("파일 {count}개", { count: item.files })}</small>}
    </button>
  )

  return (
    <section className="page-view developers-page">
      <PageIntro
        eyebrow={tc("eyebrow", "개발자용")}
        title={t("uniconnect 구조 지도")}
        description={t("코드가 어떤 파트로 나뉘고 서로 어떻게 이어지는지 봐요. 파트를 누르면 파일과 서버 창구가 나와요.")}
      />

      {lang === "en" && <p className="dev-note">{t("파트와 파일의 설명은 한국어로만 있어요.")}</p>}

      <section aria-labelledby="dev-overview-title" className="dev-overview">
        <h2 className="dev-heading" id="dev-overview-title">
          {t("한눈에 보기")}
        </h2>
        <p className="dev-summary">{map.summary}</p>
        <div className="dev-lanes">
          {lanes.map((lane) => {
            const top = byId.get(lane.id)!
            return (
              <div className="dev-lane" key={lane.id}>
                <button aria-pressed={selected === top.id} className="dev-lane-head" onClick={() => choose(top.id)} type="button">
                  <strong>{t(lane.title)}</strong>
                  <small>{t("파일 {count}개", { count: top.files })}</small>
                </button>
                <div className="dev-parts">
                  {childrenOf(top.id).map((item) => {
                    const inner = childrenOf(item.id)
                    if (inner.length === 0) return partButton(item)
                    return (
                      <div className="dev-part-group" key={item.id}>
                        {partButton(item)}
                        <div className="dev-part-children">{inner.map((child) => partButton(child, true))}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
          <div className="dev-lane">
            <div className="dev-lane-head static">
              <strong>{t("바깥 서비스")}</strong>
              <small>{t("{count}곳", { count: externals.length })}</small>
            </div>
            <div className="dev-parts">{externals.map((item) => partButton(item, true))}</div>
            <div className="dev-lane-head static">
              <strong>{t("그 밖에")}</strong>
            </div>
            <div className="dev-parts">{others.map((item) => partButton(item, true))}</div>
          </div>
        </div>
      </section>

      <section aria-labelledby="developers-detail-title" className="dev-detail" id="developers-detail">
        <div className="dev-detail-head">
          <span className="dev-crumb">{node.parent ? fullLabel(node.parent) : t("맨 위")}</span>
          <h2 id="developers-detail-title">{node.label}</h2>
          <p>{node.summary}</p>
          <p className="dev-stats">
            {t("파일 {files}개 · 코드 {loc}줄 · 서버 창구 {routes}개", {
              files: detail.files.length,
              loc: detail.files.length === 0 ? 0 : node.loc.toLocaleString("ko-KR"),
              routes: detail.routes.length,
            })}
          </p>
        </div>

        <div className="dev-links">
          {[
            { title: t("이 파트가 쓰는 곳"), items: detail.uses },
            { title: t("이 파트를 쓰는 곳"), items: detail.usedBy },
          ].map((column) => (
            <div className="dev-link-column" key={column.title}>
              <h3>{column.title}</h3>
              {column.items.length === 0 ? (
                <p className="dev-empty">{t("없어요.")}</p>
              ) : (
                <ul>
                  {column.items.map(([id, entry]) => (
                    <li key={id}>
                      <button onClick={() => choose(id)} type="button">
                        <span>{fullLabel(id)}</span>
                        <small>{[...entry.kinds].map((kind) => t(linkKinds[kind])).join(" · ")}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        {detail.routes.length > 0 && (
          <div className="dev-list">
            <h3>{t("서버 창구 {count}개", { count: detail.routes.length })}</h3>
            <ul>
              {detail.routes.map((route) => (
                <li key={`${route.m} ${route.p}`}>
                  <RouteLine route={route} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {detail.files.length > 0 && (
          <div className="dev-list">
            <h3>{t("파일 {count}개", { count: detail.files.length })}</h3>
            <ul>
              {detail.files.map((file) => (
                <li key={file.p}>
                  <FileLine file={file} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section aria-labelledby="dev-search-title" className="dev-search">
        <h2 className="dev-heading" id="dev-search-title">
          {t("파일과 서버 창구 찾기")}
        </h2>
        <label className="catalog-search">
          <Icon name="search" size={16} />
          <input
            aria-label={t("파일과 서버 창구 찾기")}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("예: 계약서, /api/proposals, checkin")}
            type="search"
            value={query}
          />
          <SearchClear onClear={() => setQuery("")} value={query} />
        </label>
        {results && (
          <div className="dev-list">
            {results.files.length + results.routes.length === 0 ? (
              <p className="dev-empty">{t("맞는 파일이나 서버 창구가 없어요.")}</p>
            ) : (
              <ul>
                {results.routes.map((route) => (
                  <li key={`${route.m} ${route.p}`}>
                    <button className="dev-result" onClick={() => choose(route.n)} type="button">
                      <RouteLine route={route} />
                    </button>
                  </li>
                ))}
                {results.files.map((file) => (
                  <li key={file.p}>
                    <button className="dev-result" onClick={() => choose(file.n)} type="button">
                      <FileLine file={file} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="dev-flows-title" className="dev-flows">
        <h2 className="dev-heading" id="dev-flows-title">
          {t("대표 흐름")}
        </h2>
        <div className="dev-flow-list">
          {map.flows.map((flow) => (
            <article className="dev-flow" key={flow.id}>
              <h3>{flow.title}</h3>
              <ol>
                {flow.steps.map((step, index) => (
                  <li key={index}>
                    <button onClick={() => choose(step.node)} type="button">
                      {step.node ? fullLabel(step.node) : ""}
                    </button>
                    <p>{step.note}</p>
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      </section>

      <p className="dev-note">{t("{date}에 코드 {commit} 기준으로 만든 지도예요.", { date: map.generatedAt, commit: map.commit })}</p>
    </section>
  )
}

function RouteLine({ route }: { route: (typeof map.routes)[number] }) {
  return (
    <span className="dev-line">
      <span className="dev-line-top">
        <span className={`dev-method ${route.m.toLowerCase()}`}>{route.m}</span>
        <code>{route.p}</code>
      </span>
      <strong>{route.name}</strong>
      {route.d && <small>{route.d}</small>}
    </span>
  )
}

function FileLine({ file }: { file: (typeof map.files)[number] }) {
  return (
    <span className="dev-line">
      <strong>{file.name}</strong>
      {file.d && <small>{file.d}</small>}
      <code>{file.p}</code>
    </span>
  )
}

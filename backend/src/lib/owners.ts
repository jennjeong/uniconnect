import type { Account, Database, Role } from "../types.js"

// 리스팅과 그 주인 계정을 잇는 도우미다. 계정은 brandId나 groupId로 자기 리스팅을 가리키고,
// 시드 카탈로그(예시)는 어느 계정에도 속하지 않는다. 여러 계정이 같은 리스팅을 가리키면
// 먼저 나온 계정이 주인이다.
export type Catalog = "brands" | "groups"

// 계정이 찾는(만나는) 쪽의 카탈로그. 학생단체에게는 브랜드다.
export const partnerCatalogOf = (role: Role): Catalog => (role === "학생단체" ? "brands" : "groups")

// 카탈로그의 리스팅을 가진 계정.
export const ownerOf = (database: Database, catalog: Catalog, listingId: string | undefined) =>
  listingId ? database.accounts.find((account) => (catalog === "brands" ? account.brandId : account.groupId) === listingId) : undefined

// 카탈로그를 모를 때: 브랜드나 단체로 그 리스팅을 가진 계정.
export const listingOwner = (database: Database, listingId: string | undefined) =>
  listingId ? database.accounts.find((account) => account.brandId === listingId || account.groupId === listingId) : undefined

// 카탈로그의 리스팅 id → 주인 계정. 리스팅마다 계정 전체를 훑지 않도록 목록에서 한 번 만든다.
export function ownersOf(database: Database, catalog: Catalog) {
  const owners = new Map<string, Account>()
  for (const account of database.accounts) {
    const id = catalog === "brands" ? account.brandId : account.groupId
    if (id && !owners.has(id)) owners.set(id, account)
  }
  return owners
}

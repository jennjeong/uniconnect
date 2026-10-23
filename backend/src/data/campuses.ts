// Campuses the app knows, found by a student's school email domain (or a
// group's school name), with where each is, for the distance to sponsors'
// stores (lib/geo.ts). The coordinates are each school's place in Kakao
// Local's keyword search (looked up 2026-10-23), next to its road address.
export type Campus = { name: string; domains: string[]; lat: number; lng: number }

export const campuses: Campus[] = [
  // 서울 노원구 화랑로 815
  { name: "삼육대학교", domains: ["syu.ac.kr"], lat: 37.64311, lng: 127.10553 },
  // 서울 노원구 화랑로 621
  { name: "서울여자대학교", domains: ["swu.ac.kr"], lat: 37.62614, lng: 127.09302 },
  // 서울 노원구 광운로 20
  { name: "광운대학교", domains: ["kw.ac.kr"], lat: 37.61924, lng: 127.05827 },
  // 서울 노원구 공릉로 232
  { name: "서울과학기술대학교", domains: ["seoultech.ac.kr"], lat: 37.63188, lng: 127.08028 },
  // 서울 도봉구 삼양로144길 33
  { name: "덕성여자대학교", domains: ["duksung.ac.kr"], lat: 37.65157, lng: 127.01506 },
  // 서울 노원구 초안산로 12
  { name: "인덕대학교", domains: ["induk.ac.kr"], lat: 37.63056, lng: 127.05467 },
]

// Campuses the app knows, found by a student's school email domain (or a
// group's school name), with where each is, for the distance to sponsors'
// stores (lib/geo.ts). The coordinates are approximate demo values; with a
// map service connected they can come from each school's address instead.
export type Campus = { name: string; domains: string[]; lat: number; lng: number }

export const campuses: Campus[] = [
  { name: "삼육대학교", domains: ["syu.ac.kr"], lat: 37.643, lng: 127.106 },
  { name: "서울여자대학교", domains: ["swu.ac.kr"], lat: 37.628, lng: 127.0905 },
  { name: "광운대학교", domains: ["kw.ac.kr"], lat: 37.6195, lng: 127.059 },
  { name: "서울과학기술대학교", domains: ["seoultech.ac.kr"], lat: 37.632, lng: 127.0775 },
  { name: "덕성여자대학교", domains: ["duksung.ac.kr"], lat: 37.6515, lng: 127.0165 },
  { name: "인덕대학교", domains: ["induk.ac.kr"], lat: 37.6306, lng: 127.0545 },
]

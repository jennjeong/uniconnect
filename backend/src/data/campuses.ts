// 앱이 아는 캠퍼스. 학생의 학교 이메일 도메인(또는 단체의 학교 이름)으로
// 찾으며 각 위치는 협찬사 매장과의 거리 계산에 쓴다(lib/geo.ts). 좌표는
// OpenStreetMap에서 각 대학 자신의 지물(2026-10-23에 조회, © OpenStreetMap
// contributors, ODbL)이며 옆에 도로명 주소를 둔다. Kakao의 결과는 보관할 수
// 없어서 거기서 가져온 것은 없다.
export type Campus = { name: string; domains: string[]; lat: number; lng: number }

export const campuses: Campus[] = [
  // 서울 노원구 화랑로 815
  { name: "삼육대학교", domains: ["syu.ac.kr"], lat: 37.64201, lng: 127.10562 },
  // 서울 노원구 화랑로 621
  { name: "서울여자대학교", domains: ["swu.ac.kr"], lat: 37.6283, lng: 127.09053 },
  // 서울 노원구 광운로 20
  { name: "광운대학교", domains: ["kw.ac.kr"], lat: 37.61976, lng: 127.05976 },
  // 서울 노원구 공릉로 232
  { name: "서울과학기술대학교", domains: ["seoultech.ac.kr"], lat: 37.63244, lng: 127.07946 },
  // 서울 도봉구 삼양로144길 33
  { name: "덕성여자대학교", domains: ["duksung.ac.kr"], lat: 37.65093, lng: 127.01691 },
  // 서울 노원구 초안산로 12
  { name: "인덕대학교", domains: ["induk.ac.kr"], lat: 37.6313, lng: 127.05433 },
]

// 협찬 물품(협찬 물품 배송)의 택배사. 서버가 받는 것과 같다 (backend
// lib/validation.ts의 carriers, lists.sync.test.ts가 검사한다). t()로 보여주고
// 값으로는 한국어를 유지한다.
export const carriers = ["CJ대한통운", "우체국택배", "한진택배", "롯데택배", "로젠택배", "경동택배", "대신택배", "편의점택배", "기타"] as const

// 택배를 조회할 곳: 택배사와 송장번호의 웹 검색이다. 검색 결과 맨 위에 각
// 택배사의 배송 조회가 나오므로, 택배사 자체 주소를 여기서 최신으로 유지할
// 필요가 없다.
export const trackingLink = (carrier: string, number: string) =>
  `https://search.naver.com/search.naver?query=${encodeURIComponent(`${carrier === "기타" ? "택배" : carrier} ${number} 배송조회`)}`

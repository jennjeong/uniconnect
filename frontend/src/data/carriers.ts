// Parcel carriers for a sponsorship's goods (협찬 물품 배송), as the server
// takes them (backend lib/validation.ts carriers; lists.sync.test.ts checks).
// Shown through t(); kept in Korean as values.
export const carriers = ["CJ대한통운", "우체국택배", "한진택배", "롯데택배", "로젠택배", "경동택배", "대신택배", "편의점택배", "기타"] as const

// Where a parcel can be looked up: a web search for the carrier and number,
// which shows each carrier's tracking at the top, so no carrier's own
// address has to be kept up to date here.
export const trackingLink = (carrier: string, number: string) =>
  `https://search.naver.com/search.naver?query=${encodeURIComponent(`${carrier === "기타" ? "택배" : carrier} ${number} 배송조회`)}`

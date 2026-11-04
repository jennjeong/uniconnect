// Made-up shops that visitors see on 추천 매칭's 가까운 순, around the demo
// group's campus, in place of real ones from Kakao: an example shouldn't put
// real businesses on show, and it asks nothing of Kakao. Each sits `east`
// and `north` metres from the campus, and its address reads from the campus
// ("삼육대학교 정문 앞 상가 1층"). None has a Kakao Map page or a phone
// number. Kinds are Kakao's category group codes
// (placeCategories in lib/validation.ts).
export type ExampleShop = {
  id: string
  name: string
  category: string
  kind: string
  address: string
  east: number
  north: number
}

export const exampleShops: ExampleShop[] = [
  { id: "example-1", name: "정문분식", category: "분식", kind: "FD6", address: "정문 앞 상가 1층", east: 50, north: -60 },
  { id: "example-2", name: "하루마트 정문점", category: "편의점", kind: "CS2", address: "정문 건너편", east: -90, north: -70 },
  { id: "example-3", name: "카페 몽글담", category: "커피전문점", kind: "CE7", address: "정문 앞 골목", east: 120, north: -110 },
  { id: "example-4", name: "한끼식당", category: "한식", kind: "FD6", address: "후문 쪽 골목", east: -230, north: 180 },
  { id: "example-5", name: "북카페 페이지", category: "북카페", kind: "CE7", address: "도서관 쪽 길 건너", east: 300, north: 220 },
  { id: "example-6", name: "토익스퀘어 어학원", category: "외국어학원", kind: "AC5", address: "버스정류장 앞 건물 3층", east: -410, north: -150 },
  { id: "example-7", name: "라멘 온기", category: "일본식라면", kind: "FD6", address: "역 가는 길 상가", east: 480, north: -260 },
  { id: "example-8", name: "데일리24 후문점", category: "편의점", kind: "CS2", address: "후문 앞", east: -520, north: 380 },
  { id: "example-9", name: "소극장 모퉁이", category: "공연장", kind: "CT1", address: "문화거리 지하 1층", east: 610, north: 340 },
  { id: "example-10", name: "디저트랩 소소", category: "디저트카페", kind: "CE7", address: "기숙사 쪽 상가 2층", east: -700, north: -240 },
  { id: "example-11", name: "드로잉 아틀리에", category: "미술학원", kind: "AC5", address: "주택가 상가 2층", east: 330, north: -790 },
  { id: "example-12", name: "포케 파도", category: "샐러드", kind: "FD6", address: "역 가는 길 1층", east: 880, north: 230 },
  { id: "example-13", name: "코딩하우스", category: "컴퓨터학원", kind: "AC5", address: "학원가 건물 4층", east: -960, north: 420 },
  { id: "example-14", name: "치킨 캠퍼스", category: "치킨", kind: "FD6", address: "먹자골목 입구", east: 1010, north: -560 },
  { id: "example-15", name: "갤러리 틈", category: "갤러리", kind: "CT1", address: "공원 옆 1층", east: -1150, north: -640 },
]

// English for copy shared across the app: dates, roles, statuses, units
// and the API client's own messages (see i18n/index.ts).
const en: Record<string, string> = {
  // Weekdays and dates (lib/date.ts)
  일: "Sun",
  월: "Mon",
  화: "Tue",
  수: "Wed",
  목: "Thu",
  금: "Fri",
  토: "Sat",
  종료: "Ended",
  "{days}일": "{days:day|days}",
  // Roles (types.ts Role), shown with t(role)
  학생단체: "Student group",
  브랜드: "Brand",
  // Statuses (types.ts EventStatus, RequestStatus)
  "매칭 중": "Matching",
  "집행 예정": "Scheduled",
  "측정 완료": "Measured",
  "검토 중": "Under review",
  수락: "Accepted",
  거절: "Declined",
  // Pages in the menus (types.ts NavLabel)
  대시보드: "Dashboard",
  "추천 매칭": "Matches",
  매칭: "Matches",
  "받은 협찬": "Offers",
  "내 행사": "My Events",
  "성과 측정": "Measurement",
  리포트: "Reports",
  "단체 찾기": "Find Groups",
  "받은 제안": "Proposals",
  "행사 일정": "Calendar",
  "성과 분석": "Analytics",
  // Kinds of sponsorship (data/sponsorTypes.ts)
  현금: "Cash",
  제품: "Products",
  서비스: "Services",
  기타: "Other",
  // Account types (data/roles.ts), also a listing's category
  "공연 동아리": "Performing arts club",
  "학술 동아리": "Academic club",
  "봉사 동아리": "Volunteer club",
  학생회: "Student council",
  "연합 동아리": "Intercollegiate club",
  "카페 · 식음료": "Cafe · Food & drink",
  "뷰티 · 패션": "Beauty · Fashion",
  "콘텐츠 · 미디어": "Content · Media",
  "스포츠 · 웰니스": "Sports · Wellness",
  교육: "Education",
  // Measurements (data/metrics.ts)
  "QR 스캔": "QR scans",
  "쿠폰 수령": "Coupons taken",
  "매장 방문": "Store visits",
  // Kinds of question (data/inquiries.ts)
  "이용 방법": "Using uniconnect",
  "계정 · 가입": "Account · Sign-up",
  "제안 · 매칭": "Proposals · Matching",
  "오류 신고": "Report a bug",
  // API client (api/client.ts)
  "서버에 연결할 수 없어요. 백엔드가 실행 중인지 확인해 주세요.": "Can't reach the server. Check that the backend is running.",
  "요청을 처리하지 못했어요.": "Couldn't process the request.",
}

export default en

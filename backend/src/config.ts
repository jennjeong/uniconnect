import path from "node:path"
import { fileURLToPath } from "node:url"

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const isProduction = process.env.NODE_ENV === "production"

// 아직 연결된 메일 서비스가 없어서 가입 코드를 데모용으로 클라이언트에 돌려줄
// 수 있다(devCode). 그러면 누구나 아무 주소로 가입할 수 있으므로,
// EXPOSE_EMAIL_CODES=true가 아니면 꺼 둔다. `npm run dev`는 backend/dev.env로
// 켠다.
export const emailCodesExposed = (env: NodeJS.ProcessEnv) => env.EXPOSE_EMAIL_CODES === "true"

// 프록시나 호스팅 플랫폼의 로드 밸런서 뒤에서는 Express가 X-Forwarded-For를
// 믿지 않으면 req.ip가 프록시가 된다. "true", 홉 수, 주소 중에서 정한다.
function trustProxy(value: string | undefined) {
  if (!value) return undefined
  if (value === "true") return true
  return /^\d+$/.test(value) ? Number(value) : value
}

export const config = {
  isProduction,
  // 개발 중에는 Vite가 PORT를 읽으므로 API는 API_PORT로 듣는다. 호스팅
  // 플랫폼은 운영 프로세스 하나에 PORT를 준다.
  port: Number(
    process.env.API_PORT ?? (isProduction ? process.env.PORT : undefined) ?? 4000,
  ),
  dataFile: process.env.DATA_FILE ?? path.join(backendRoot, "data", "db.json"),
  // 데이터와 계약서 사진을 보관할 Postgres 데이터베이스로, Vercel처럼 파일이
  // 오래 남지 않는 호스트를 위한 것이다(Neon 연동이 DATABASE_URL을 설정한다).
  // 없으면 dataFile과 그 옆에 둔다.
  databaseUrl: process.env.DATABASE_URL ?? process.env.POSTGRES_URL,
  // Vercel Cron이 매일 알림에 bearer 토큰으로 보낸다(vercel.json,
  // routes/cron.ts). 설정하지 않으면 그 경로는 닫혀 있다.
  cronSecret: process.env.CRON_SECRET,
  frontendDist: process.env.FRONTEND_DIST ?? path.resolve(backendRoot, "..", "frontend", "dist"),
  // 운영자가 /api/admin으로 질문을 읽고 답하게 한다(X-Admin-Token 헤더로
  // 보낸다). 설정하지 않으면 그 경로는 닫혀 있다.
  adminToken: process.env.ADMIN_TOKEN,
  // Vercel에서는 한 홉 앞의 엣지가 X-Forwarded-For를 직접 설정한다.
  trustProxy: trustProxy(process.env.TRUST_PROXY ?? (process.env.VERCEL ? "1" : undefined)),
  // 둘이 모두 설정되면 Resend로 인증 코드를 이메일로 보낸다(lib/mailer.ts).
  // MAIL_FROM은 "uniconnect <no-reply@example.com>" 같은 형태다.
  resendApiKey: process.env.RESEND_API_KEY,
  // 알림 메일의 링크에 쓰는 사이트 주소다(예: https://uniconnect.kr).
  siteUrl: process.env.SITE_URL,
  mailFrom: process.env.MAIL_FROM,
  // 프론트엔드를 다른 출처에서 호스팅할 때만 필요하다.
  corsOrigin: process.env.CORS_ORIGIN,
  // 캠퍼스 주변의 실시간 매장을 위한 Kakao Local의 REST 키다
  // (developers.kakao.com, lib/places.ts). Kakao는 결과를 실시간 응답으로만
  // 쓰게 하므로 거기서 온 것은 아무것도 보관하지 않는다.
  kakaoRestApiKey: process.env.KAKAO_REST_API_KEY,
  // 가까운 순의 지도를 위한 Kakao Maps의 JavaScript 키다. 브라우저가 보내며,
  // Kakao 콘솔에서 사이트 도메인으로 제한한다. 없으면 앱이 자체 스케치를
  // 그린다.
  kakaoMapKey: process.env.KAKAO_JS_KEY,
  // Kakao나 Naver 로그인이다(routes/social.ts). 제공자마다 클라이언트 ID가
  // 설정되면 보인다(Kakao의 것은 앱의 REST API 키이고 비밀 키는 선택이며,
  // Naver는 둘 다 필요하다). 제공자에 등록할 리디렉션 주소는 SITE_URL +
  // /api/auth/social/<provider>/callback이다.
  kakaoClientId: process.env.KAKAO_LOGIN_CLIENT_ID,
  kakaoClientSecret: process.env.KAKAO_LOGIN_CLIENT_SECRET,
  naverClientId: process.env.NAVER_CLIENT_ID,
  naverClientSecret: process.env.NAVER_CLIENT_SECRET,
  // 브랜드의 매장 주소를 지도에 놓는 OpenStreetMap Nominatim 서버다
  // (예: https://nominatim.openstreetmap.org, lib/geocode.ts). 없으면 주소는
  // 보관하지만 거리가 없다.
  nominatimUrl: process.env.NOMINATIM_URL,
  // SNS 게시물의 조회수를 읽는 YouTube Data API 키(lib/snsPosts.ts). 없으면
  // 게시물은 링크와 캡처로 확인한다.
  youtubeApiKey: process.env.YOUTUBE_API_KEY,
  // 조용한 한 시간 뒤에 새 오류가 생기면 운영자에게 알린다(lib/errorLog.ts).
  // 메일이 설정된 뒤에 동작한다.
  operatorEmail: process.env.OPERATOR_EMAIL,
  // 국세청 사업자등록 확인(lib/business.ts)을 위한 data.go.kr 키다. 없으면
  // 브랜드가 사업자를 확인할 수 없다.
  ntsServiceKey: process.env.NTS_SERVICE_KEY,
  // 카드 결제(lib/billing.ts)를 위한 Toss Payments API 키다(개별 연동 키:
  // test_ck/test_sk이고, PG 계약을 맺으면 live_ck/live_sk). 클라이언트 키는
  // 결제 창에 가고 비밀 키는 여기에 남는다.
  tossClientKey: process.env.TOSS_CLIENT_KEY,
  tossSecretKey: process.env.TOSS_SECRET_KEY,
  emailCodeTtlMs: 3 * 60 * 1000,
  emailCodeMaxAttempts: 5,
  // 한 주소가 15분에 요청할 수 있는 코드 수다(확인은 10개 더). 브라우저
  // 테스트는 각자 같은 주소에서 가입하므로 이 값을 올린다.
  codesPerClient: Number(process.env.CODES_PER_CLIENT) || 20,
  // 틀린 추측은 새 코드가 와도 이만큼 계속 센다.
  emailCodeAttemptWindowMs: 30 * 60 * 1000,
  verificationTtlMs: 30 * 60 * 1000,
  sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
  exposeEmailCodes: emailCodesExposed(process.env),
}

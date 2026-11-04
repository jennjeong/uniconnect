// Vercel은 이 함수 하나로 API를 돌린다(vercel.json이 /api/*를 여기로 보낸다).
// `npm run build`가 컴파일한 Express 앱이며, backend/src/vercel.ts를 참고한다.
export { default } from "../backend/dist/vercel.js"

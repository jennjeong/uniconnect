// 첫 화면을 그리기 전에 받는 영어. 개발과 테스트에서는 사전 전체이고, 빌드에서는
// vite.config.ts가 이 파일을 첫 다운로드의 소스에 나오는 문장만으로 바꾼다
// (i18n/firstScreen.ts). 나머지는 lib/pageStyles.ts의 lazyPage가 다른 화면을 열 때
// 함께 받는다(i18n/index.ts의 loadEnglish).
export { en as first } from "./index"

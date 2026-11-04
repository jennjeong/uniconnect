import analytics from "./analytics"
import catalog from "./catalog"
import common from "./common"
import dashboard from "./dashboard"
import forms from "./forms"
import insights from "./insights"
import landing from "./landing"
import layout from "./layout"
import legal from "./legal"
import measurement from "./measurement"

// 화면에 나오는 모든 한국어 문장의 영어 (i18n/index.ts), 앱의 영역마다 파일
// 하나.
export const en: Record<string, string> = {
  ...common,
  ...layout,
  ...dashboard,
  ...catalog,
  ...measurement,
  ...analytics,
  ...forms,
  ...insights,
  ...landing,
  ...legal,
}

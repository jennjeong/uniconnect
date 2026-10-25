import analytics from "./analytics"
import catalog from "./catalog"
import common from "./common"
import dashboard from "./dashboard"
import forms from "./forms"
import landing from "./landing"
import layout from "./layout"
import legal from "./legal"
import measurement from "./measurement"

// English for every Korean sentence the screens show (i18n/index.ts),
// one file per area of the app.
export const en: Record<string, string> = {
  ...common,
  ...layout,
  ...dashboard,
  ...catalog,
  ...measurement,
  ...analytics,
  ...forms,
  ...landing,
  ...legal,
}

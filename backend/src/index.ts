import { createApp } from "./app.js"
import { config } from "./config.js"
import { loadDatabase } from "./store.js"

await loadDatabase()

createApp().listen(config.port, () => {
  console.log(`uniconnect API → http://localhost:${config.port}/api`)
})

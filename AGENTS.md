# uniconnect

Sponsorship matching prototype that connects student groups (학생단체) with brands (브랜드). It is a pnpm workspace with a React frontend and an Express API. The UI copy is Korean.

## Commands

Run these from the repo root:

- `corepack pnpm@10.34.3 install` installs every workspace package.
- `npm run dev` starts the API on http://localhost:4000 and Vite on http://localhost:8443. Vite proxies `/api` to the API.
- `npm run typecheck` runs tsc for the backend and the frontend.
- `npm test` runs the backend API tests (`node:test` through tsx).
- `npm run build`, then `npm start`, builds both packages and serves the API plus the built frontend from Express.

## Project Structure

- `frontend/src/App.tsx` holds the app state and the API calls, and switches between pages and modals for the current role.
- `frontend/src/api/` has the fetch wrapper with the Bearer token (`client.ts`) and one function per endpoint (`index.ts`).
- `frontend/src/pages/`, `modals/`, `layout/` and `components/` contain the UI. `data/`, `lib/` and `hooks/` contain constants and helpers.
- `frontend/src/layout/Header.tsx` is the fixed header of floating pills: logo, the role's menu on wide screens, the next event, account buttons, Menu and the register pill. `NavMenu.tsx` is the full-screen silver menu behind Menu and `Footer.tsx` the footer, a deep blue mesh card with linked chrome rings over the site's links (left out of a conversation).
- `frontend/src/scenes/` holds the WebGL effects: getlayers.ai's Antipode gradient (dashboard hero, detail banners) and Interference gradient (reports, measurement, analytics), run by `LayersGradient.tsx` from `shaders.ts`; Stride's mesh gradient, drawn once into an image (`MeshBackdrop.tsx`); and its chrome chain and rings (`ChromeScene.tsx`, `chromeModels.ts`).
- `frontend/src/index.css` is the single global stylesheet. Components use its class names, so a renamed class must change in both places.
- `backend/src/routes/` has one Express router per resource.
- `backend/src/data/seed.ts` holds the demo accounts and data.
- `backend/src/store.ts` is the JSON file store. It writes `backend/data/db.json`, which is gitignored; delete the file to reseed.

## Conventions

- `frontend/src/types.ts` mirrors the API shapes in `backend/src/types.ts`.
- Account types and sponsor types are listed in both `backend/src/lib/validation.ts` and the frontend (`data/roles.ts`, `pages/EventCreatePage.tsx`). Change them together. The same goes for profile fact labels and SNS platforms (`validation.ts` and `data/profile.ts`).
- The brand and group catalogs are editable listings: each account's own listing is linked by `brandId`/`groupId` and edited from 내 정보. Recommended matches are the other catalog's top three, worked out in `backend/src/lib/catalog.ts`.
- Student groups and brands have separate menus and pages (`data/navigation.ts`). A feature for one side gets its own page rather than a role branch inside the other side's page.
- Every screen is a `View` with its own address (`lib/route.ts`). Change screens through App's `go` and `goBack`, never by setting state directly, so the browser's back and forward buttons and swipe gestures keep working.
- Popups go inside `<Presence>` (`components/Presence.tsx`) so they animate closed however they are closed.
- The scenes load three.js lazily, pause off screen, hold still with reduced motion and leave a CSS background when WebGL is missing. Each live scene is its own WebGL context, so keep them few: a dashboard has three (hero, chain, footer rings) and other pages at most one besides the footer; the mesh draws through one shared context into images. A canvas keeps one context for life and React mounts effects twice in development, so a scene that loses its context on cleanup creates its canvas inside the effect (as `LayersGradient.tsx` does) or creates the context only after an async import. The getlayers.ai shaders are verbatim; retint them through their `config` only. The ShaderGradient (`components/GradientBackdrop.tsx`, lazily loaded `GradientScene.tsx`) heads only the login and sign-up popups (`<Modal banner>`). `three` is pinned to 0.182.0 because from r183 three warns that `THREE.Clock` is deprecated, and @react-three/fiber 9.8.1 still creates one for every canvas.
- The backend is ESM with NodeNext resolution, so relative imports end in `.js`.
- Express 5 forwards thrown and rejected errors to the error handler. Throw `HttpError(status, message)` with a Korean message the user can read.
- The UI is a light theme after getlayers.ai's Stride in deep blue and silver, with slate grays instead of black. Design tokens are CSS variables on `:root` in `index.css`: `--point` is the deep blue point color and text on it uses `--on-point` (`--point-strong` for blue text on white); copy uses `--ink`, `--ink-soft` and `--muted`; silver fills use `--fill`/`--fill-strong` or `--silver-gradient` with `--silver-ring`; hairlines are `--line` or the inset `--ring`; dark tiles use `--slate`. Use the tokens rather than new hex values. Copy over a moving gradient sits on a navy shade or frosted navy glass; check its contrast against the live canvas when moving it. The PDF report pages keep their own print colors on `.pdf-export`.
- Pages open with `components/PageIntro.tsx` (eyebrow, title, actions). Main actions use `components/Pill.tsx` (`primary`, `white` on blue panels, `silver`, `outline`, `outline-light`); `.primary-button` (deep blue), `.cancel-button` (outlined) and `.detail-button` (silver) are the same pill shapes and turn white on blue banners. Brands and groups show as `components/WorkCard.tsx`. The dashboards are built from `MeetingHero`, `LogoMarquee`, `RevealStatement`, `StatsBento` and `JourneyChain`.
- Text is Pretendard Variable from the `pretendard` package, imported in `main.tsx`, in the weights of the `--weight-*` tokens only: Thin 100 (the loader's count), ExtraLight 200 (display headings and large numbers), Medium 500 (copy), SemiBold 600 (labels, buttons, card titles), Bold 700 (emphasis), ExtraBold 800 (badges, counts) and Black 900 (the wordmark). Don't use 300 or 400. The PDF export writes in only the font files the pages loaded (`report/pdf.ts`). Animated headings use `RevealTitle`, `RevealWords` or `RevealStatement` (`components/RevealText.tsx`) with plain text; they wait for the intro loader (`lib/intro.ts`), and headings with a digit stay still.
- Motion lives in the "Motion" section of `index.css`: a `stagger` class on a list makes its items arrive one after another, `data-reveal` makes a block rise out of a blur when it scrolls into view (`lib/reveal.ts`, delay with `--reveal-delay`), `components/AnimatedNumber.tsx` counts numbers up on arrival, and `lib/ripple.ts` adds the press ripple. Keep the reduced-motion rule at the end of that section. Tailwind v4 is available, but the UI is styled through the classes in `index.css`.
- No mail service is connected yet. Email verification codes come back as `devCode` while `EXPOSE_EMAIL_CODES` is on, which is the default outside production. A real sender belongs in `backend/src/lib/mailer.ts`.

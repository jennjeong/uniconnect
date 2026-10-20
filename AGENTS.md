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
- The backend is ESM with NodeNext resolution, so relative imports end in `.js`.
- Express 5 forwards thrown and rejected errors to the error handler. Throw `HttpError(status, message)` with a Korean message the user can read.
- Design tokens are CSS variables on `:root` in `index.css`; `--point` is the yellow point color.
- Motion lives in the "Motion" section of `index.css`: a `stagger` class on a list makes its items arrive one after another, `components/AnimatedNumber.tsx` counts numbers up, and `lib/ripple.ts` adds the press ripple. Keep the reduced-motion rule at the end of that section. Tailwind v4 is available, but the UI is styled through the classes in `index.css`.
- No mail service is connected yet. Email verification codes come back as `devCode` while `EXPOSE_EMAIL_CODES` is on, which is the default outside production. A real sender belongs in `backend/src/lib/mailer.ts`.

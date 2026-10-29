# NeuroCurve coding & ChatGPT Sites handoff

NeuroCurve is an anonymous activation-function workbench, not a server-side training service.

## Product invariants
- All curve design, diagnostics, dataset training, CPU and WebGPU work must execute **on the visitor's device**, not on Sites' server.
- No login, gallery, leaderboard, automatic draft storage, telemetry upload, or automatic posting.
- Sharing requires explicit consent. Keep share URLs unlisted and deletable by a one-time capability; never place deletion keys into URLs, logs, or public JSON.
- Share lifetimes: 7 days / 30 days / 365 days / unlimited. Storage cleanup cannot replace request-time expiration checks.
- No `eval`, `new Function`, or execution of user-uploaded JavaScript/Python. Only validated data, mathematical expression ASTs and control points are accepted.
- Keep Apache-2.0 for the code; **do not** automatically license user-created shared functions under Apache.
- Do not display model scores as real measurements without actually executing training.

## Engineering map
- `public/`: browser UI, shared mathematical definitions, client CPU and WebGPU training, dataset assets.
- `server/`: existing Node.js/SQLite standalone service, retained for localhost use and historical test comparisons.
- `sites/`: proposed request handler for ChatGPT Sites-compatible Worker runtime. Requires D1 (`DB`), R2 (`REVOCATIONS`), static assets (`ASSETS`), and rate salt (`RATE_SALT`). It has been **mock-tested only**, not yet verified in a real Sites environment.
- `tests/sites.test.js`: Cloudflare-like Web API/D1/R2 mock verification. Run `npm test` and `npm run check` before shipping.
- `docs/WORK_SITES_HANDOFF.md`: target, risks and precise acceptance gates for Sites.

## Sites-specific requirements
- Use **ChatGPT Sites in Work**, not Railway, Vercel or a custom always-on Node host.
- Ask Sites to check local source compatibility and provision D1 and R2; do not fabricate `.openai/hosting.json` or a project ID. The Sites runtime may require changes to `sites/worker.js` or an official starter template.
- Don't deploy publicly until D1/R2 persistence, rollback/revocation safety, anonymous abuse controls and actual Chrome/Safari/Firefox CPU/GPU fallback have passed independent integration checks.
- Before creating production Sites bindings, test against development storage. Do not restore an old D1 snapshot without retaining the current independent R2 revocation records.
- Code is for research; improvements require side-by-side validation with ReLU, Swish and GELU under identical conditions. Always distinguish `PASS`, `FAIL` and `UNCERTAIN`.

## v1.0 benchmark UI candidate
- Fixed core six-task and extended ten-task suites live in `public/core/suite.js`. Do not average raw Accuracy and RMSE.
- Game score of 50 means matching median ReLU/Swish/GELU error for the same task; overall is equally weighted across four task categories.
- Incomplete suites never get an aggregate score. One seed is exploratory. No public scoreboard, accounts or automatic result uploads.
- Add UI/browser acceptance: actual pointer stroke -> PCHIP -> Core 6 CPU benchmark -> score -> local SVG export.
- `npm run benchmark:suite` executes real CPU training; `npm run build:sites-static` generates static publishable UI but intentionally has no anonymous API.
- Sites integration must route actual `/api/config`, POST/GET/DELETE shares and backed storage before the sharing claim can be made.

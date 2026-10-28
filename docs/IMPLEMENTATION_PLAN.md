# NeuroCurve v0.8 implementation plan

Goal: Deliver a runnable, tested browser-first activation-function laboratory without changing the existing GitHub repository.
Architecture: Native browser ES modules + dedicated Worker for local Float64 MLP/Adam training. Same pure mathematics modules on client and server. Node HTTP server + SQLite content database and independently stored revocation ledger. Managed Postgres adapter is not included; this build requires persistent disk.
Spec: docs/spec-v0.8.md

## Binding constraints
No accounts, gallery, draft persistence, analytics, or automatic posting. No arbitrary code evaluation. No server-side ML. Immutable opt-in shares, 7/30/365/unlimited lifetime, deletion capability never in URLs, uniform unavailable responses. Source license Apache-2.0; no automatic licensing of user content. Existing remote repository unchanged.

## Decisions
- Baseline browser backend is native JavaScript Float64 CPU in a Web Worker. Do not claim GPU acceleration; unsupported GPU paths are explicitly not enabled.
- Formula input uses a bounded parser and analytic chain rule, never eval/new Function.
- All function types use explicit tangent-line extension outside their domain.
- Generalized valleys retain independent depth/width/spacing/asymmetry controls. Actual extrema are measured, not inferred from count.
- Shared third-party definitions can be copied locally but cannot be re-published via the UI by default; origin metadata and permission text remain attached. This is a policy, not DRM.
- Local server uses separate SQLite files for content and deletion ledger. Public deployment must retain ledger independently across content restores and configure HTTPS, operational retention and abuse handling.

## Tasks / interfaces / checks
- [x] Mathematics: public/core/{expression,activation,export}.js. compileDefinition(def) -> function returning [value,derivative], validateDefinition, analyze. Tests: finite differences >30 cases, PCHIP against SciPy, extrema, malformed input, safe extrapolation, serialization roundtrip.
- [x] Local learning: public/core/{data,training}.js + public/worker.js. Deterministic data/splits and initial weights; train/runBenchmark with explicit budget, cancel via worker termination. Tests: parameter finite-difference check, loss reduction, seed determinism, three datasets, abnormal function stop, paired baselines.
- [x] Sharing: server/{store,app,png}.js. Atomic/idempotent create, delete capabilities, synchronous access-time expiration, independently retained revocations, limits, safe HTML/OG, no-store. Tests: consent, conflicts, boundary, wrong key, restore, XSS, oversize, rate limit, no listing.
- [ ] UI: public/{index.html,app.js,style.css}. Responsive studio + analysis + learning + results, draw and point editing, undo/redo, import/export, sharing, deletion, report. E2E: desktop/mobile, formula, changes reflected, real training, cancellation, share/reload/delete, no storage or uploads without consent.
- [ ] Release: README, setup/run/deployment commands, security/retention docs, acceptance matrix, source ZIP, actual browser screenshots. All completion claims backed by fresh tests.

## High-risk inputs
Duplicate x, near-zero widths, huge/nested formulas, network lost after successful create, a restored old content DB without matching current deletion ledger. Test failure modes explicitly.

## 実施記録
数学・学習エンジン・共有サーバーのローカル実装とテストは完了。UIは実装済み、オフラインDOMおよび配布HTMLの検査は通過。公開URLからのE2Eは管理ポリシーにより未確認のため、UI全体と公開リリースのチェックは完了にしない。成果物配布と公開サービス完成を分ける。
詳細はVERIFICATION.md。新機能の検査はRED→GREEN、追加の管理CLIスモーク検査は既存コードの検証として実施。

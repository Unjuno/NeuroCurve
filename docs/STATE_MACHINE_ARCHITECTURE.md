# NeuroCurve — Explicit workflow architecture (2026-11-06)

## Decision

NeuroCurve uses **three coordinated state regions**, not one implicit combination of flags. `public/core/workflow-machine.js` is a dependency-free, side-effect-free reducer. `public/app.js` is the adapter that starts/stops browser Workers, renders Canvas/DOM, handles private deletion receipts and calls the share API. The numerical engine is unchanged.

The state machine deliberately **never receives** training datasets, model weights, user curves, deletion keys, or submission payloads. It stores only phases, monotonic revision/run numbers and an opaque share request ID. This avoids persisting private work and keeps reducer tests deterministic.

## State regions and transitions

| Region | States | Events / guards |
|---|---|---|
| Document | `revision >= 0` | `DOCUMENT_CHANGED` increments for committed function changes (including undo/redo, control-point dragging, import and mode changes that alter the definition). |
| Evaluation | `idle → preparing → running → complete` with branches to `stale`, `error`, `cancelled` | `RUN_START` rejected while running; `RUN_READY` requires matching run ID; `RUN_SUCCESS`, `RUN_FAILURE`, `RUN_CANCEL` require matching active ID. Any change in document revision or evaluation selection makes an in-flight completion stale. |
| Sharing | `unavailable ↔ idle → prepared → posting → published` with retryable `error` | `SHARING_AVAILABLE` derives from the actual config API; `SHARE_PREPARE` captures revision and request ID; `SHARE_SUBMIT` requires consent AND deletion-key saved confirmation, matching request ID and revision; mismatched callbacks are ignored. |

An older result may remain in experiment JSON but MUST NOT appear as a valid current Challenge Score. Once an experiment is stale, changing a selection back cannot silently re-certify it.

## Invariants

1. A tab must not start concurrent learning Workers. Each run has a monotonically increasing `runId` and immutable document revision / selection snapshot.
2. Ignore all messages from a terminated or replaced Worker using both Worker identity and run ID checks.
3. Terminate Workers on failure, timeout or cancellation. Late completion must never revive a cancelled run.
4. Any committed function edit or evaluation-selection change invalidates current scoring. In-flight completions after edits are historical.
5. A sharing draft is bound to a specific function revision and request ID; editing invalidates unsubmitted drafts and clears the pending key. Already posted shares remain immutable snapshots.
6. No eval, automatic draft upload, backend training or leaderboard. CPU/WebGPU continue on the visitor device.
7. The static Sites build must honestly describe disabled URL sharing; file export is not public URL sharing.

## Boundaries

- `core/activation.js`, `core/sketch-stroke.js`: mathematical definitions and normalized drawing.
- `core/training.js`, `core/webgpu.js`: numerical learning and gradients.
- `core/suite.js`: task-normalized challenge score, reproducibility criteria.
- `core/workflow-machine.js`: transitions, guards and revisions only (pure).
- `app.js`: DOM, Worker lifecycle and local secret handling; `state.busy` is temporarily a derived legacy compatibility flag, NOT a second source of truth.
- `sites/worker.js` and `server/`: opt-in share adapters; live Sites API/storage compatibility still requires on-platform verification.

## TDD and acceptance evidence

- `node --test tests/workflow-machine.test.js tests/workflow-contract.test.js`
- `npm test && npm run check && npm run build:sites-static`
- Optional: `python tests/browser_workflow.py` with Playwright and Chromium; draws a curve, completes CPU training, changes evaluation conditions and checks the stale-state ribbon, plus 390 px layout. These tests were run locally against a prior v1.0 snapshot before code was applied to the latest GitHub branch; GitHub CI verifies the current source after commit.
- Real Sites sharing/expiry/deletion and actual WebGPU learning remain UNCERTAIN until independently verified in the target environment. Do not infer production PASS from mock tests.

## UI design rationale

The workflow ribbon describes the *actual reducer phase*, not decorative completion. It differentiates untested, preparing, running, complete, stale, failed and cancelled states; displays current URL-sharing availability; and uses a polite status live region and visible keyboard focus, not color alone. The main curve editor and multi-task score remain in place.

References: W3C WAI-ARIA 1.2 §5.3.5; MDN Using Web Workers; D. Harel, “Statecharts: A Visual Formalism for Complex Systems” (1987), doi:10.1016/0167-6423(87)90035-9.

### Partial benchmark handling

When a Worker returns normally but one of the required benchmark tasks has failed, the evaluation region transitions to `partial`, **not** `complete`. Task-level successful measurements remain visible; the overall Challenge Score and shareable scorecard are not certified. A later edited curve or changed selection is still marked outdated by the existing score validity guards.

### Network ambiguity: immutable retry and recovery

An HTTP POST may have been accepted even if the browser never received the response. Accordingly, `error` following `posting` is **not** an unsubmitted draft: document edits may not destroy its request ID or deletion receipt, and reopening the dialog cannot issue `SHARE_PREPARE` again. Retries use the exact immutable request body and stable server-idempotency key.

When the current curve has a different document revision than the previously submitted snapshot, ordinary `SHARE_SUBMIT` is forbidden. The old request can only be retried with the distinct `SHARE_RECOVER` event and the user's explicit confirmation that they are resubmitting the **old** curve, alongside original sharing consent and deletion-key custody confirmation. Every new curve edit clears that additional checkbox, not the key. The UI reports if a successful post represents an older snapshot.

The user may abandon an ambiguous POST only after affirming the deletion receipt is saved and accepting a warning that an earlier request may have been accepted. No client-side drafts, secrets or training results are automatically persisted or uploaded.

## 2026-11-08 — Result certification, Worker liveness and GPU suite preflight

**Certification boundary:** a set of six/ten `suite-task-end` events is not a final benchmark. The UI can show provisional per-task scores as tasks finish, but **must not display the overall Challenge Score or unlock its export/share actions** until the matching Worker emits `complete`. The reducer checks the same document revision, same benchmark selection, and `complete` (not `partial`, `stale`, `cancelled` or `error`) before an overall score is certified. A changed curve during an in-flight run never gets scored with the old curve's result.

**Worker watchdog:** `core/worker-watchdog.js` starts a 15-second startup timer and renews a 130-second *inactivity* timer on each accepted Worker message, including GPU-preflight task progress. The timer is not a benchmark duration limit: long runs can continue while reporting progress. Stale timer callbacks are invalidated by generation numbers. On timeout, the UI marks the current run as failed and terminates the Worker; no intermediate measurements are certified. Stop/failure/completion always disarm the watchdog.

**GPU multi-task compatibility:** `core/gpu-preflight-plan.js` inspects every task in the selected suite, compiles/checks kernels once per **unique input/output shape** (Core 6: four; Extended 10: six for the current datasets), and reports per-task progress. One shape failing preflight causes **uniform CPU fallback** when the user selects automatic mode; GPU-required mode fails explicitly instead of silently mixing CPU and GPU task measurements. This still needs WebGPU hardware acceptance testing: mock/unit tests do not prove device-driver correctness.

**Tests:** `tests/evaluation-lifecycle.test.js` and `tests/gpu-preflight-plan.test.js` check phase, staleness, timer races, multi-task topology coverage, GPU failure propagation and UI integration. `npm test`, `npm run check`, and `npm run build:sites-static` must pass on the final SHA before merge.

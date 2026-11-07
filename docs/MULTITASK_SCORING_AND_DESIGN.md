# NeuroCurve v1.0 — Multi-task score / UX design

**Status:** candidate implementation tested locally. Not yet deployed to live ChatGPT Sites.

## Fixed benchmark suites

| Suite | Datasets | Task coverage |
|---|---|---|
| Core (6) | moons, circles, digits, iris, wave, chirp | nonlinear classification, digits vision features, small real tabular classification, wave regression |
| Extended (10) | Core + spiral, xor, wine, breast | more nonlinear geometries and tabular tasks |

The bundled real datasets are UCI CC BY 4.0 with attribution; synthetic ones are reproducibly generated. Each task uses deterministic train/validation/test splits (approximately 70/15/15), feature standardization trained on the train subset only, same MLP architecture, seed and batch order for Custom/ReLU/Swish/GELU. **Digits is the UCI 8x8 Digits sample, NOT MNIST.**

## Scoring

Raw task metrics MUST remain visible. Classification uses error=1-accuracy; regression uses error=RMSE. For each seed, reference error is the median of ReLU, Swish and GELU under matched settings.

`taskScore = 50 + 50 * (refError - customError) / (refError + customError + 0.000001)`

Task score is median over seeds. A category score is the arithmetic mean of its member task scores. Overall is the arithmetic mean of the **four category scores** (nonlinear, vision, tabular, signal), rounded to two decimals. 50 = benchmark reference; higher than 50 = lower task error than median baseline, lower than 50 = higher error. All numbers are dimensionless; accuracy and RMSE are never averaged directly.

Any extra, failed, duplicated, missing or off-protocol run invalidates the suite score. All seeds and tasks must use a consistent compute backend and numeric precision. The UI invalidates the old score after drawing, point dragging, undo, redo or changing the function definition. If any required task/run fails or is missing, overall is `null`, not a partial grade. A run with one seed is `exploratory`; five seeds are `multi-seed descriptive` (not statistically confirmed). No public ranking is created. No client score is server-verified. Changing the curve marks the prior score stale until rerun.

## UX / visual design

- Give drawing a clear hero entry point; retain specialized math controls and unclutter the default view.
- Learning has three scopes: single task / Core 6 / Extended 10.
- A prominent scoreboard displays overall, four category bars, actual metrics and task completion.
- The scoreboard uses high-contrast emerald/navy; mobile uses stacked layout with a scrollable data table.
- Local SVG score-card export and summary copy are enabled only after a complete suite, and clearly marked **unverified**.
- Server-side anonymous URL sharing remains a separate deployment gate. Do not claim availability for static Sites builds.

## Release gates for Work / ChatGPT Sites

1. Merge/review source and run test/check/static build with latest supported Node LTS.
2. Browser E2E: gesture drawing -> PCHIP -> Core 6 CPU test -> task metrics -> score card.
3. Browser E2E: new 10 datasets, mobile UX, keyboard navigation, copy/download score card.
4. On GPU hardware: WebGPU compile, forward/backprop/Adam, CPU parity; report actual backend.
5. Integrate real Sites API, storage bindings and immutable deletion revocation. Anonymous posting/reading/deleting/expiry tests must pass.
6. Verify fresh public login-free visit at existing URL and ensure no 'offline only' banner if sharing actually enabled.

**Do not merge as production-ready without Steps 2–6.**

## Protocol consistency (2026-11-08)

Both single-task and cross-task scoring now call the same pure `inspectBenchmarkProtocol` in `public/core/benchmark-protocol.js`. This enforces the official 1×150 or 5×600 seed/update budget, all four paired activation functions, fixed architecture 32→32, Adam learning rate 0.001, batch size 64, correct metric name and range, no failed/duplicate/missing runs, and CPU Float64 or WebGPU Float32 backend consistency. The training engine imports its seed/update modes from this same module so that validation cannot silently diverge from execution.

A different hyperparameter, unapproved seed, missing flag, invalid metric or mixed/unknown backend makes the corresponding task ineligible, and **no overall score is certified**. Per-task successful raw values may still be inspected. This checks self-reported protocol consistency, not proof of real execution or independent statistical superiority. The new tests reproduce accepted off-protocol scores before the fix and reject them afterward.

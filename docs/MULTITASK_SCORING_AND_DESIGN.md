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

If any required task/run fails or is missing, overall is `null`, not a partial grade. A run with one seed is `exploratory`; five seeds are `multi-seed descriptive` (not statistically confirmed). No public ranking is created. No client score is server-verified. Changing the curve marks the prior score stale until rerun.

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

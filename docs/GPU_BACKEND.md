# WebGPU learning backend — v0.9.0 (GPU real-device acceptance pending)

## What runs where

- Browser `DedicatedWorker`: selects CPU, WebGPU or automatic fallback. No private datasets are uploaded.
- `WebGPU` (when available): compute shader for each training example's **forward and backward passes**, parallel reduction of 64 per-example gradients, global clipping, and Adam weight updates. No mock GPU timing or GPU-labelled CPU updates.
- `CPU`: source data generation and seeded batch indices; `Float64` final metric computation from the GPU's read-back `Float32` weights, including valley coverage.
- `native-js-cpu`: fully CPU `Float64` baseline.

WebGPU shader arithmetic is `Float32`. **Custom activations use a uniform 16,384-interval sampled `Float32` C¹ cubic Hermite function and derivative** over the saved domain, with tangent extrapolation at endpoints. Before execution, 514 jittered points are compared with the exact CPU-defined function. The *first GPU training batch is checked for loss and gradient agreement against CPU backpropagation* before reporting a successful run. Inaccurate GPU gradients fail the run rather than being reported as a valid GPU result. A genuine device, shader compilation, compute dispatch and read-back verification are required.

Note: WebGPU can expose a software adapter; known software fallback renderers are rejected. Browser privacy restrictions may conceal adapter hardware identity. Therefore 'WebGPU' is a backend label, not a verified manufacturer/physical-GPU claim. GPU may be slower than CPU for this tiny MLP because of kernel-launch and GPU↔CPU transfer overhead. A CPU vs GPU time comparison is not a pure hardware benchmark due to Float32/Float64 differences and setup overhead.

## Backend policy

- Auto (default): only verified compute capable device / all four activation kernels compile / LUT precision passes → WebGPU. Otherwise CPU Float64, with a user-visible reason.
- WebGPU required: all checks must pass; no silent CPU fallback.
- CPU: deterministic native JS Float64 Worker.
- If a device fails mid-training, the affected run is marked failed; no silent CPU/GPU mixture in the same comparison.
- The default benchmark is 32→32 hidden units, batch64, Adam at 0.001, gradient norm max 5. Quick: 150 updates × 1 seed; full: 600 × 5 seeds.
- The user may terminate the Worker to stop running. The browser manages pending GPU command cleanup.

## Run-to-run consistency

Record `backend`, `dtype`, per-run times, `gpuSetupMs`, `activationLut`, `gradientAudit`, batch size, model dimensions, seeds and loss histories. GPU and CPU results may differ from rounding and LUT approximation; comparisons within the same backend and same browser/device are the default.

## Verification status

Passed: static shader-structure tests, numeric LUT/derivative comparisons for preset/expression/sketch/valley, rejection of invalid gradient audit, Worker CPU fallback, other Node tests. Not yet passed: actual WebGPU shader compilation and training on a real browser GPU, Safari/Firefox/Android compatibility, performance measurements, public HTTPS E2E. This execution environment blocks all navigations in its managed Chromium, including localhost/file. Do not present GPU as production-verified until a compatible device executes the smoke test and logs the output.

## Smoke test to run on a compatible client

1. Host via HTTPS or localhost; open the site. Pick **WebGPU必須** and **高速試験**, dataset Two Moons.
2. Require a successful WebGPU probe, **four** GPU-compute runs, and a `gradientAudit.passed:true` for each run in the exported results.
3. Repeat for Digits and Multi-frequency. Check `loss` is finite and `validation/test` metrics are finite; compare against CPU Float64 as a separate backend, not as identical arithmetic.
4. On a device without WebGPU, `GPU必須` must fail with a clear explanation; `自動` must switch to CPU and report the fallback.
5. Test Worker stop while the GPU is working. Look for GPUDevice lost, validation, out-of-memory and compilation errors in browser dev tools. Only then mark GPU acceptance PASS.

## Security

Only validated numeric function definitions are accepted; functions are evaluated on the CPU then sampled to a bounded Float32 table. Shader text interpolates only bounded integer dimensions and numeric constants. No user-authored WGSL, GLSL, JavaScript, or Python runs. Do not add arbitrary code evaluation, GPU vendor identifiers to public shares, or automatic result uploads.

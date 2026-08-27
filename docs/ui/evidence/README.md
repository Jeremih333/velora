# Visual evidence

Each `ui-NN` directory contains:

- `expected.jpg` — the controlled user reference from `docs/ui/reference`;
- `actual.png` — the latest production-like Playwright capture;
- `diff.png` — a 3× amplified per-channel pixel-difference heatmap after resizing the reference to the actual capture dimensions.

Rebuild states 01–46 after the iPhone E2E run:

```powershell
powershell -ExecutionPolicy Bypass -File toolkit/build-visual-evidence.ps1 -From 1 -To 46
```

The heatmap is evidence of difference, not an automatic approval. A row may be marked `PASS` only after its logic, exact-state accessibility, viewport coverage, and reviewed visual acceptance all pass.

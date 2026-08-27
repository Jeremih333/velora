# Visual QA procedure

1. Build the production-like web bundle; never approve a dev-server screenshot.
2. Run the deterministic fixture and action sequence from [SCREENSHOT_MANIFEST.yaml](SCREENSHOT_MANIFEST.yaml).
3. Capture iPhone, Android and desktop where the manifest requires them.
4. Store the controlled reference, actual capture and amplified diff under `docs/ui/evidence/ui-NN/`.
5. Inspect the actual image, not only the pixel score. Record clipping, overlap, incorrect hierarchy, inaccessible contrast, missing controls and state mismatch.
6. Run the associated logic and accessibility tests.
7. Promote statuses independently: functional evidence does not imply visual parity, and visual evidence does not imply production verification.

For character-image evidence, additionally inspect that the source is not stretched, the cover crop follows the saved focal point, both labelled sliders remain reachable, extreme-ratio guidance wraps naturally, and a failed image leaves a stable fallback without shifting the surrounding card.

The evidence builder is `toolkit/build-visual-evidence.ps1`. Current honest conclusions are in [FINAL_VISUAL_REPORT.md](FINAL_VISUAL_REPORT.md) and [FINAL_SCREENSHOT_MATRIX.md](../testing/FINAL_SCREENSHOT_MATRIX.md).

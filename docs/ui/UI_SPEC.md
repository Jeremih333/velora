# Velora UI specification

This document defines the current canonical product shell. The 46 imported screenshots are research references, not assets to copy. The implemented Velora UI becomes canonical only after its state is functionally and visually approved.

## Product shell

- Telegram Mini App bootstrap is authenticated from server-validated `initData`.
- Primary destinations are discovery, characters, chats, personas and settings/profile.
- Mobile uses a fixed safe-area-aware bottom navigation. Desktop may widen the content and keep equivalent destinations visible.
- Every visible mutation is backed by the Worker API and D1. Optimistic UI must reconcile with the server response and expose failure.
- Hidden or unavailable features are omitted or explicitly disabled; they are never presented as working controls.

## Canonical states

The exact route, fixture, actions and expected state for every supplied reference live in [SCREENSHOT_MANIFEST.yaml](SCREENSHOT_MANIFEST.yaml). Functional and visual conclusions live in [FINAL_VISUAL_REPORT.md](FINAL_VISUAL_REPORT.md).

## State ownership

| State                                                    | Owner                                                       |
| -------------------------------------------------------- | ----------------------------------------------------------- |
| Telegram identity and authorization                      | Worker session derived from verified Telegram data          |
| Characters, personas, lorebooks, conversations, messages | D1 through allowlisted Worker operations                    |
| Draft input and overlay state                            | React, with persistent draft recovery where required        |
| Theme and language preference                            | Persisted user settings with Telegram/system fallback       |
| Model selection and availability                         | D1 model registry plus provider availability reconciliation |

## Character image contract

- Character images always render with `object-fit: cover`; intrinsic proportions are never stretched.
- Each character persists `avatarFocalX` and `avatarFocalY` as percentages in the inclusive `0..100` range. The default focal point is the centre (`50`, `50`).
- The character editor exposes one preview and two labelled range controls for horizontal and vertical focal position. Saving a draft or publishing preserves the selected values through the Worker API and D1.
- Image loading reads `naturalWidth` and `naturalHeight`. Missing, failed and invalid geometry use the stable character fallback; extreme portrait and landscape ratios keep a warning in the editor without blocking a valid image.
- Every discovery, profile, conversation and editor avatar uses the same focal-point renderer so the crop does not change between surfaces.

## Release language

States use the required ladder: `NOT_IMPLEMENTED`, `IMPLEMENTED`, `FUNCTIONALLY_VERIFIED`, `VISUALLY_VERIFIED`, `PRODUCTION_VERIFIED`, `RELEASE_GATES_PASS`. A passing unit test cannot promote a screen to visual or production verification.

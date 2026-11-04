# Module — mobile-app

Answers go to brief § 14 "Type-specific" under a `### mobile-app` heading, unless another section is named.

| # | Question | Notes / default |
|---|----------|-----------------|
| M1 | **[lite]** Platforms: iOS, Android, both? Tablets? Minimum OS versions? | |
| M2 | **[lite]** List the main screens and the primary user flow. | Becomes `02-reference/screens/` |
| M3 | Native (Swift/Kotlin) or cross-platform (Flutter, React Native, KMP)? Existing team skills? | Both platforms + small team → cross-platform |
| M4 | Does it work offline? What must sync, and how are conflicts resolved? | Offline drives the data architecture — ask early |
| M5 | Device features: camera, location, push notifications, biometrics, Bluetooth, background tasks? | Each needs permission copy and store review notes |
| M6 | Backend: existing API, new API (→ load `api-service.md`), or BaaS? | |
| M7 | Distribution: public app stores, enterprise/MDM, internal testing only? Store accounts ready? | Missing accounts → open question (lead time) |
| M8 | Designs available? Platform-native look or custom brand? | |
| M9 | Analytics, crash reporting, in-app purchases, deep links? | |

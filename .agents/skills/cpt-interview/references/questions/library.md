# Module — library

Answers go to brief § 14 "Type-specific" under a `### library` heading, unless another section is named.

| # | Question | Notes / default |
|---|----------|-----------------|
| B1 | **[lite]** Who uses it — your own projects, your organization, the open-source public? | Public → license, contribution guide, stricter compatibility |
| B2 | **[lite]** Sketch the public API: the main functions/classes and one usage example. | Becomes `02-reference/public-api.md` |
| B3 | Target language versions and runtimes (e.g. Node 20+, Python 3.10+, browser + Node)? | |
| B4 | Dependency policy: zero runtime deps, minimal, or unconstrained? | Default: minimal |
| B5 | Package registry and package name? Is the name available? | Unknown → open question |
| B6 | Compatibility promise: SemVer? Deprecation policy? | Default: SemVer, deprecate one minor before removal |
| B7 | Documentation: README only, API docs generated from code, docs site with examples? | |
| B8 | License? | Ask; do not default for public libraries |
| B9 | Performance or size budgets (bundle size, allocations, latency)? | |

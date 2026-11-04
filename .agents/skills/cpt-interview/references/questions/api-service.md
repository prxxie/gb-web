# Module — api-service

Answers go to brief § 14 "Type-specific" under a `### api-service` heading, unless another section is named.

| # | Question | Notes / default |
|---|----------|-----------------|
| A1 | **[lite]** (infer) Who calls this API — your own front end, other internal services, third parties, the public? | Public/third party → versioning, rate limits, docs portal |
| A2 | **[lite]** List the main resources or operations. | Becomes `02-reference/api/` |
| A3 | Style: REST, GraphQL, gRPC, or event/message based? | Default: REST + JSON with OpenAPI |
| A4 | Authentication for callers: session cookie, bearer token (JWT/OAuth2), API key, mTLS? | Matches X4 |
| A5 | Response conventions: envelope, pagination style, error format, date/time format, ID format? | Default: RFC 9457 problem details, cursor or page/size paging, ISO-8601 UTC |
| A6 | Versioning and backward-compatibility promises? | Default: URL prefix `/v1`, no breaking changes within a version |
| A7 | Rate limits, quotas, idempotency for writes? | Payments/orders → idempotency keys |
| A8 | Long-running work: background jobs, scheduled tasks, webhooks out? | |
| A9 | Database preference? Transactions or consistency rules that matter (e.g. no double-booking)? | Default: PostgreSQL |
| A10 | Observability: logging format, metrics, tracing, health checks? | Default: structured JSON logs, `/health` endpoint |

# Module — integration

Automations, bots, connectors, sync jobs, ETL between systems. Answers go to brief § 14 "Type-specific" under a
`### integration` heading, unless another section is named.

| # | Question | Notes / default |
|---|----------|-----------------|
| I1 | **[lite]** Which systems are connected, and what moves between them, in which direction? | One row per flow; becomes `02-reference/pipelines.md` |
| I2 | **[lite]** What triggers each flow — schedule, webhook/event, user command, file drop? | |
| I3 | For each system: API type, authentication, rate limits, sandbox availability, documentation link? | Missing sandbox or credentials → open question (blocks testing) |
| I4 | Field mapping: who defines how fields in A map to B? Are there transformations or lookups? | Mapping doc in `00-source/` if it exists |
| I5 | Failure handling: retries, dead-letter, alerting, who is notified, manual replay? | Default: bounded retry with backoff, alert on final failure |
| I6 | Idempotency and duplicates: can the same record be processed twice safely? | |
| I7 | Volume and timing: records per run / per day, deadlines (e.g. "before 8am")? | |
| I8 | Where does it run — serverless, a container, an iPaaS, a scheduled job on a server? | |
| I9 | Audit: must every transfer be logged and traceable? Retention? | |

# Module — data-ml

Data pipelines, analytics, ML training/inference, and LLM-powered features. Answers go to brief § 14
"Type-specific" under a `### data-ml` heading, unless another section is named.

## Data

| # | Question | Notes / default |
|---|----------|-----------------|
| P1 | **[lite]** What are the data sources, their formats, sizes, and update frequency? | Becomes `02-reference/pipelines.md` |
| P2 | **[lite]** What is the output — tables, reports, dashboards, a model, predictions served by an API, generated text? Who consumes it? | |
| P3 | Batch, streaming, or on-demand? Schedule or latency requirement? | |
| P4 | Data quality rules: required fields, deduplication, late or bad data handling? | |
| P5 | Where does data live and run — warehouse, lake, notebook, orchestrator (Airflow, Dagster, cron)? | |

## Models (skip if no ML/LLM)

| # | Question | Notes / default |
|---|----------|-----------------|
| P6 | **[lite]** What should the model decide or generate? What is a good vs bad output, with examples? | Becomes the evaluation set — insist on examples |
| P7 | Build vs buy: train your own, fine-tune, or call a hosted model/LLM API? Which provider constraints? | |
| P8 | How is quality measured offline (metric, threshold, eval dataset) and online (feedback, A/B)? | No metric → open question, blocks model stories |
| P9 | Cost and latency budget per prediction / request? | |
| P10 | Reproducibility and governance: versioning of data and models, explainability, bias review, human review of outputs? | Regulated domain → security flag |

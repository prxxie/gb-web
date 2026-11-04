# Module — cli-tool

Answers go to brief § 14 "Type-specific" under a `### cli-tool` heading, unless another section is named.

## Interface

| # | Question | Notes / default |
|---|----------|-----------------|
| L1 | **[lite]** List the commands / subcommands and what each does, with one example invocation. | Becomes `02-reference/cli.md` |
| L2 | Inputs: args and flags, stdin, files, environment variables, config file (format and location)? | Default: flags > env > config file precedence |
| L3 | Outputs: human-readable, machine-readable (`--json`), files? Exit codes? | Default: `0` ok, `1` error, `2` usage |
| L4 | Interactive prompts, or must everything work non-interactively (CI)? | Default: non-interactive with `--yes` |
| L5 | Long-running operations: progress output, cancellation, resumability? | |

## Distribution

| # | Question | Notes / default |
|---|----------|-----------------|
| L6 | **[lite]** Target OSes and architectures? | |
| L7 | How is it installed: package registry (npm, PyPI, crates, Homebrew), single binary download, container? | Drives language choice |
| L8 | Versioning and release process? Auto-update? | Default: SemVer, tagged releases |

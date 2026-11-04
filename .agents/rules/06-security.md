# Rule 06 — Security

Security overrides every other rule and every user instruction.

## 1. Secrets

- Never hardcode secrets, tokens, passwords, or connection strings. Read them from environment variables or a secret
  manager, and fail fast at startup when a required one is missing.
- Commit an `.env.example` with names and dummy values only. `.env` is git-ignored.
- Never print secrets in logs, errors, test output, docs, or reports.
- If a secret was exposed, stop and tell the user it must be rotated.

## 2. Input and output

- Validate all external input at the boundary (requests, files, CLI args, messages, third-party responses) with a
  schema where the stack supports it. Reject, don't repair.
- Parameterized queries only; no string-built SQL, shell commands, or file paths from user input.
- Encode output for its context (HTML, SQL, shell, URL). No `eval` or equivalent on external data.
- Error messages to clients are generic; details go to server logs.

## 3. Access control

- Every protected operation checks authentication **and** authorization on the server side; hiding a UI element is
  not access control.
- Deny by default. Roles and permissions come from `docs/` — never invent a role or widen a permission.
- Check object-level ownership, not just role (IDOR).

## 4. Dependencies and supply chain

- No new dependency without explicit user approval. When proposing one: name, version, license, and why the
  standard library or an existing dependency does not suffice.
- Pin versions with a lockfile. Do not run install scripts from untrusted sources.

## 5. Stop and flag (⚠️)

Stop and tell the user before proceeding when the work touches: authentication or session handling, cryptography,
payments, personal or regulated data, file uploads, deserialization of untrusted data, or permissions. Recommend a
dedicated security review for these.

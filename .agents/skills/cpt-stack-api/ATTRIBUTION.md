# Attribution

`packs/api` was distilled from one MIT-licensed skill in [affaan-m/ECC](https://github.com/affaan-m/ECC) v2.2.3,
© 2026 Affaan Mustafa:

- `skills/api-design` — resource naming, method and status-code semantics, error envelope, pagination comparison,
  filtering/sorting vocabulary, rate-limit headers, versioning and deprecation policy, endpoint checklist

Changes made to fit the CPT pack contract:

- Framework code in the upstream skill (Next.js route handlers, Django REST Framework serializers, Go `net/http`
  handlers) was dropped. Those belong to the stack packs; this pack decides only the wire shape, which is what makes
  it installable next to both `cpt-stack-fastapi` and `cpt-stack-nestjs`.
- The upstream skill offers two success envelopes (`{ data }` wrapper or flat) without deciding. This pack keeps the
  choice but makes it an explicit, recorded project decision with one rule per endpoint, because a contract that varies
  per endpoint is not a contract.
- The upstream examples mix `snake_case` and `camelCase` in the same JSON. This pack requires one casing across
  responses, requests, and query parameter names, recorded in the API `README.md` decisions block.
- The error body was pinned to RFC 9457 problem details, matching the pre-existing `packs/fastapi` guidance, instead of
  the upstream `{ error: { code, message, details } }` shape — two backends must not ship two error formats.
- SQL-level pagination reasoning (keyset vs `OFFSET`, unique tiebreaker) is referenced from `packs/data` rather than
  restated.

## Upstream license (MIT)

The upstream MIT license text and copyright notice travel with these portions:

MIT License — Copyright (c) 2026 Affaan Mustafa

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

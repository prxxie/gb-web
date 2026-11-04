/**
 * A tiny path matcher — `/rooms/:code` style patterns, named parameters, no dependencies.
 *
 * Parameters are addressed by name (`params.code`), never by position: a route that gains a segment
 * must not silently shift what `p0` means.
 */

export interface Match<T extends string> {
  readonly params: Readonly<Record<T, string>>;
}

export function match<T extends string>(pattern: string, pathname: string, names: readonly T[]): Match<T> | null {
  const expected = pattern.split("/").filter((segment) => segment !== "");
  const actual = pathname.split("/").filter((segment) => segment !== "");
  if (expected.length !== actual.length) return null;
  const params: Record<string, string> = {};
  let nameIndex = 0;
  for (let index = 0; index < expected.length; index += 1) {
    const segment = expected[index]!;
    const value = actual[index]!;
    if (segment.startsWith(":")) {
      const name = names[nameIndex];
      if (name === undefined) return null;
      params[name] = decodeURIComponent(value);
      nameIndex += 1;
    } else if (segment !== value) {
      return null;
    }
  }
  return { params: params as Record<T, string> };
}

/** Compares x.y.z versions numerically; anything after the patch number (a pre-release tag) is ignored. */
export function compareVersions(a: string, b: string): number {
  const parse = (version: string) => version.split(/[.+-]/).slice(0, 3).map((part) => Number.parseInt(part, 10) || 0)
  const left = parse(a)
  const right = parse(b)
  for (let i = 0; i < 3; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) return Math.sign(diff)
  }
  return 0
}

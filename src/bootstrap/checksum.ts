export function hasPinnedSha256(value: string | undefined): boolean {
  return Boolean(value && value.length === 64 && !value.startsWith('TODO'));
}

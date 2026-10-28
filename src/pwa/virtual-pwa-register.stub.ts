// Test-only stand-in for the plugin's virtual module (see vitest.config.ts).
export function registerSW(): (reload?: boolean) => Promise<void> {
  return async () => {}
}

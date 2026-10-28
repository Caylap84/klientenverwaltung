/** Dünner Wrapper um window.confirm, damit Tests ihn ersetzen können. */
export function confirmAction(message: string): boolean {
  return window.confirm(message)
}

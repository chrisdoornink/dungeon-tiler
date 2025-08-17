export function go(href: string) {
  if (typeof window !== 'undefined') {
    window.location.assign(href);
  }
}

// Runtime flag that is true ONLY in the standalone HTML5 bundle. Its index.html sets
// window.__STANDALONE__ = true before any module loads. The Next.js app never sets it,
// so shared code guarded by isStandalone() behaves exactly as before there.
declare global {
  // eslint-disable-next-line no-var
  interface Window {
    __STANDALONE__?: boolean;
  }
}

export function isStandalone(): boolean {
  return typeof window !== "undefined" && window.__STANDALONE__ === true;
}

export {};

// Minimal next/navigation replacement. TilemapGrid only uses useRouter(); its
// push targets (/daily-new, /end) are daily/story routes never hit in endless,
// so window.location is a safe fallback.
export function useRouter() {
  return {
    push: (href: string) => {
      if (typeof window !== "undefined") window.location.assign(href);
    },
    replace: (href: string) => {
      if (typeof window !== "undefined") window.location.replace(href);
    },
    back: () => {
      if (typeof window !== "undefined") window.history.back();
    },
    forward: () => {
      if (typeof window !== "undefined") window.history.forward();
    },
    refresh: () => {},
    prefetch: () => Promise.resolve(),
  };
}

export function usePathname(): string {
  return typeof window !== "undefined" ? window.location.pathname : "/";
}

export function useSearchParams(): URLSearchParams {
  return new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
}

export function redirect(href: string): void {
  if (typeof window !== "undefined") window.location.assign(href);
}

export function notFound(): void {}

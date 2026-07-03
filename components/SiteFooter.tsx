import Link from "next/link";

/**
 * Small site-wide footer with the Privacy link. Kept intentionally quiet — tiny
 * pixel type at the bottom of the daily start / completed screens so it never
 * competes with gameplay UI.
 */
export default function SiteFooter() {
  return (
    <footer className="pixel-text mx-auto mt-12 mb-4 flex max-w-lg items-center justify-center text-center text-[8px] text-gray-400">
      <Link
        href="/privacy"
        className="underline underline-offset-2 hover:text-gray-200 transition-colors"
      >
        Privacy
      </Link>
    </footer>
  );
}

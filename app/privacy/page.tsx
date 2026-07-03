import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy — Torch Boy",
  description:
    "No accounts, anonymous analytics, and progress kept in your browser.",
};

const bodyFont = { fontFamily: "var(--font-geist-sans), Arial, sans-serif" };

export default function PrivacyPage() {
  return (
    <main
      className="min-h-screen py-12 px-4"
      style={{
        backgroundImage: "url(/images/presentational/wall-up-close.png)",
        backgroundRepeat: "repeat",
        backgroundSize: "auto",
      }}
    >
      <div className="mx-auto max-w-lg rounded-lg bg-black/60 p-8 shadow-xl backdrop-blur-sm">
        <h1 className="mb-6 text-center text-2xl font-bold text-blue-400">
          Privacy
        </h1>

        <div className="space-y-4 text-gray-200" style={bodyFont}>
          <p className="leading-relaxed">
            Torch Boy has no accounts and shows no ads. Your data is not sold.
          </p>
          <p className="leading-relaxed">
            Game progress — your current run, streak, and totals — is stored
            locally in your browser. Clearing your browser data resets it.
          </p>
          <p className="leading-relaxed">
            Anonymous usage analytics are collected via PostHog: a random ID kept
            in your browser, basic gameplay events, and error reports. This is not
            linked to your name or any personal identity.
          </p>
          <p className="leading-relaxed">
            If you submit feedback and include an email address, it is used only
            to reply.
          </p>
        </div>

        <div className="mt-8 flex items-center justify-center text-xs" style={bodyFont}>
          <Link
            href="/"
            className="text-gray-300 underline underline-offset-4 hover:text-white"
          >
            ← Back to the dungeon
          </Link>
        </div>
      </div>
    </main>
  );
}

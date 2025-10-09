"use client";

import { FormEvent, useState } from "react";
import { usePathname } from "next/navigation";
import { trackFeedback } from "../lib/posthog_analytics";

const INITIAL_STATE = {
  message: "",
  email: "",
};

export default function FeedbackButton() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [formValues, setFormValues] = useState(INITIAL_STATE);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  
  // Hide feedback button on crossword page
  if (pathname === "/crossword") {
    return null;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedMessage = formValues.message.trim();
    if (!trimmedMessage) {
      return;
    }

    setIsSubmitting(true);

    try {
      trackFeedback({
        message: trimmedMessage,
        email: formValues.email?.trim() || undefined,
        url: typeof window !== "undefined" ? window.location.href : undefined,
      });
      setIsSubmitted(true);
      setFormValues(INITIAL_STATE);
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeModal = () => {
    setIsOpen(false);
    setIsSubmitted(false);
    setFormValues(INITIAL_STATE);
  };

  return (
    <div className="fixed bottom-4 left-4 z-50">
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="group relative flex items-center gap-2 p-2 text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label="Open feedback form"
        title="Feedback"
      >
        <span
          aria-hidden
          className="w-8 h-8 inline-block"
          style={{
            backgroundImage: "url(/images/presentational/chat-bubble.png)",
            backgroundSize: "contain",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center",
          }}
        />
        {/* Hover/focus reveal label */}
        <span
          className="pointer-events-none select-none absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap text-sm font-medium opacity-0 translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0 group-focus:opacity-100 group-focus:translate-x-0"
        >
          Share Feedback
        </span>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-start bg-black/30 p-4 sm:items-center sm:justify-center"
          role="dialog"
          aria-modal="true"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-sm rounded-lg bg-white p-4 text-slate-900 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                Share Feedback
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-full p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                aria-label="Close feedback form"
              >
                ×
              </button>
            </div>

            {isSubmitted ? (
              <p className="text-sm text-slate-600">
                Thanks! Your feedback has been sent.
              </p>
            ) : (
              <form className="space-y-3" onSubmit={handleSubmit}>
                <label className="block text-xs font-semibold uppercase text-slate-500">
                  What&apos;s on your mind?
                  <textarea
                    required
                    value={formValues.message}
                    onChange={(event) =>
                      setFormValues((prev) => ({
                        ...prev,
                        message: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 p-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
                    rows={4}
                    placeholder="Share an idea, bug, or anything else..."
                  />
                </label>

                <label className="block text-xs font-semibold uppercase text-slate-500">
                  Email (optional)
                  <input
                    type="email"
                    value={formValues.email}
                    onChange={(event) =>
                      setFormValues((prev) => ({
                        ...prev,
                        email: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 p-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
                    placeholder="you@example.com"
                  />
                </label>

                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Sent securely to our PostHog workspace.</span>
                  <button
                    type="submit"
                    disabled={isSubmitting || !formValues.message.trim()}
                    className="rounded-full bg-slate-800 px-3 py-1 font-semibold uppercase text-white transition disabled:cursor-not-allowed disabled:bg-slate-400 hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                  >
                    {isSubmitting ? "Sending..." : "Send"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


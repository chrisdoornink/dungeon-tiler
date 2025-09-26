"use client";

import { FormEvent, useState } from "react";
import { trackFeedback } from "../lib/posthog_analytics";

const INITIAL_STATE = {
  message: "",
  email: "",
};

export default function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [formValues, setFormValues] = useState(INITIAL_STATE);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

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
        className="rounded-full bg-slate-800 px-3 py-2 text-xs font-semibold uppercase text-white shadow-md transition hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        Feedback
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

import React, { useState } from "react";

interface DailyPollModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (responses: PollResponses) => void;
}

export interface PollResponses {
  preferredMode: "single" | "three" | "ten" | null;
  otherFeedback: string;
}

const DailyPollModal: React.FC<DailyPollModalProps> = ({
  open,
  onClose,
  onSubmit,
}) => {
  const [preferredMode, setPreferredMode] = useState<PollResponses["preferredMode"]>(null);
  const [otherFeedback, setOtherFeedback] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ preferredMode, otherFeedback });
    onClose();
  };

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        backdropFilter: "blur(2px)"
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Daily challenge feedback"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-lg shadow-2xl p-6 text-sm"
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.95)",
          border: "2px solid rgba(255, 255, 255, 0.1)",
          boxShadow: "0 0 20px rgba(0, 0, 0, 0.8), inset 0 0 20px rgba(255, 255, 255, 0.05)"
        }}
      >
        <div className="mb-6 text-center">
          <h2 className="text-xl font-bold text-yellow-200 mb-3" style={{ textShadow: "2px 2px 4px rgba(0, 0, 0, 0.8)" }}>
            ⚔️ Help Shape the Daily Challenge ⚔️
          </h2>
          <p className="text-gray-200 text-sm italic">
            Your feedback helps make the dungeon more treacherous!
          </p>
        </div>

        <div className="space-y-6">
          {/* Game Mode Preference */}
          <div>
            <p className="mb-3 text-gray-200 font-medium">
              Which daily challenge format do you prefer?
            </p>
            <div className="space-y-2">
              <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-700 hover:border-gray-500 hover:bg-gray-900/50 transition-all cursor-pointer">
                <input
                  type="radio"
                  name="mode"
                  value="single"
                  checked={preferredMode === "single"}
                  onChange={() => setPreferredMode("single")}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="font-semibold text-gray-100">Single Level Mode</div>
                  <div className="text-xs text-gray-300 mt-1 italic">
                    Quick and intense - one floor, one chance at glory
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-700 hover:border-gray-500 hover:bg-gray-900/50 transition-all cursor-pointer">
                <input
                  type="radio"
                  name="mode"
                  value="three"
                  checked={preferredMode === "three"}
                  onChange={() => setPreferredMode("three")}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="font-semibold text-gray-100">3-Stage Mode <span className="text-green-400 text-xs">(Current)</span></div>
                  <div className="text-xs text-gray-300 mt-1 italic">
                    Balanced challenge - multiple floors, strategic depth
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-700 hover:border-gray-500 hover:bg-gray-900/50 transition-all cursor-pointer">
                <input
                  type="radio"
                  name="mode"
                  value="ten"
                  checked={preferredMode === "ten"}
                  onChange={() => setPreferredMode("ten")}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="font-semibold text-gray-100">10-Stage Mode</div>
                  <div className="text-xs text-gray-300 mt-1 italic">
                    Epic journey - full dungeon delve for true adventurers
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Other Feedback */}
          <div>
            <label className="block mb-2 text-gray-200 font-semibold">
              Any other feedback for the dungeon master?
            </label>
            <textarea
              value={otherFeedback}
              onChange={(e) => setOtherFeedback(e.target.value)}
              placeholder="Share your thoughts about the daily challenge..."
              className="w-full h-20 rounded-lg border border-gray-700 bg-gray-900/50 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:border-yellow-500 focus:outline-none resize-none"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-md border border-gray-600 bg-gray-800/50 text-gray-300 hover:bg-gray-700/50 hover:border-gray-500 transition-all text-sm"
          >
            Skip Survey
          </button>
          <button
            type="submit"
            className="px-4 py-2 rounded-md bg-[#2E7D32] text-white hover:bg-[#256628] transition-colors border-0 font-semibold text-sm"
          >
            Submit Feedback
          </button>
        </div>
      </form>
    </div>
  );
};

export default DailyPollModal;

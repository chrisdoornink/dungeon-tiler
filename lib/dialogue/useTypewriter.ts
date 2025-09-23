import { useCallback, useEffect, useState } from "react";

export interface TypewriterState {
  rendered: string;
  isTyping: boolean;
  skip: () => void;
  reset: () => void;
}

const DEFAULT_INTERVAL_MS = 22;

export function useTypewriter(text: string, intervalMs: number = DEFAULT_INTERVAL_MS): TypewriterState {
  const [visibleChars, setVisibleChars] = useState(0);

  useEffect(() => {
    setVisibleChars(0);
  }, [text]);

  useEffect(() => {
    if (text.length === 0) {
      return;
    }
    if (visibleChars >= text.length) {
      return;
    }

    const id = window.setTimeout(() => {
      setVisibleChars((prev) => {
        if (prev >= text.length) return prev;
        return prev + 1;
      });
    }, Math.max(4, intervalMs));

    return () => {
      window.clearTimeout(id);
    };
  }, [text, visibleChars, intervalMs]);

  const skip = useCallback(() => {
    setVisibleChars((prev) => (prev >= text.length ? prev : text.length));
  }, [text]);

  const reset = useCallback(() => {
    setVisibleChars(0);
  }, []);

  const rendered = text.slice(0, visibleChars);
  const isTyping = text.length > 0 && visibleChars < text.length;

  return { rendered, isTyping, skip, reset };
}

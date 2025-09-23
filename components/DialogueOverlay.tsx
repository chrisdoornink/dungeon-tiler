import React from "react";
import styles from "./DialogueOverlay.module.css";

interface DialogueOverlayProps {
  speaker?: string;
  text: string;
  renderedText: string;
  isTyping: boolean;
  hasMore: boolean;
  onAdvance: () => void;
}

const DialogueOverlay: React.FC<DialogueOverlayProps> = ({
  speaker,
  text,
  renderedText,
  isTyping,
  hasMore,
  onAdvance,
}) => {
  const displayText = renderedText.length > 0 ? renderedText : "\u00a0";
  const showCursor = isTyping;
  const ariaTitle = speaker ? `${speaker}: ${text}` : text;

  return (
    <div
      className={styles.overlay}
      data-testid="dialogue-overlay"
      role="dialog"
      aria-live="polite"
      aria-label={ariaTitle}
      onClick={onAdvance}
    >
      <div className={`${styles.panel} pixel-text`}>
        <div className={styles.header}>
          <span className={styles.speaker}>{speaker ?? ""}</span>
        </div>
        <div className={styles.body} data-testid="dialogue-text">
          {displayText}
          {showCursor ? <span className={styles.cursor}>▌</span> : null}
        </div>
        <div className={styles.footer}>
          <div className={styles.hint}>
            <span className={styles.hintKey}>Enter</span>
            <span className={styles.hintKey}>Tap</span>
            <span>{isTyping ? "Reveal" : hasMore ? "Next" : "Close"}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DialogueOverlay;

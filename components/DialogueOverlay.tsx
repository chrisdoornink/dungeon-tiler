import React from "react";
import styles from "./DialogueOverlay.module.css";

interface DialogueChoiceOption {
  id: string;
  label: string;
}

interface DialogueOverlayProps {
  speaker?: string;
  text: string;
  renderedText: string;
  isTyping: boolean;
  hasMore: boolean;
  onAdvance: () => void;
  choices?: DialogueChoiceOption[];
  selectedChoiceIndex?: number;
  onSelectChoice?: (id: string) => void;
}

const DialogueOverlay: React.FC<DialogueOverlayProps> = ({
  speaker,
  text,
  renderedText,
  isTyping,
  hasMore,
  onAdvance,
  choices,
  selectedChoiceIndex = 0,
  onSelectChoice,
}) => {
  const displayText = renderedText.length > 0 ? renderedText : "\u00a0";
  const showCursor = isTyping && (!choices || choices.length === 0);
  const ariaTitle = speaker ? `${speaker}: ${text}` : text;
  const hasChoices = Boolean(choices && choices.length > 0);
  const footerLabel = hasChoices
    ? "Choose"
    : isTyping
    ? "Reveal"
    : hasMore
    ? "Next"
    : "Close";
  const isHero = (speaker ?? "").toLowerCase() === "hero";

  const handleOverlayClick = () => {
    if (hasChoices) return;
    onAdvance();
  };

  return (
    <div
      className={styles.overlay}
      data-testid="dialogue-overlay"
      role="dialog"
      aria-live="polite"
      aria-label={ariaTitle}
      onClick={handleOverlayClick}
    >
      <div className={`${styles.panel} pixel-text`}>
        <div className={styles.header}>
          <span className={`${styles.speaker} ${isHero ? styles.heroSpeaker : ""}`}>{speaker ?? ""}</span>
        </div>
        <div
          className={`${styles.body} ${isHero ? styles.heroBody : ""}`}
          data-testid="dialogue-text"
        >
          {displayText}
          {showCursor ? <span className={styles.cursor}>▌</span> : null}
        </div>
        {hasChoices ? (
          <div className={styles.choices} role="listbox" aria-label="Responses">
            {choices!.map((choice, index) => {
              const isSelected = index === selectedChoiceIndex;
              return (
                <button
                  key={choice.id}
                  type="button"
                  className={`${styles.choiceButton} ${
                    isSelected ? styles.choiceButtonActive : ""
                  }`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectChoice?.(choice.id);
                  }}
                  aria-selected={isSelected}
                >
                  <span className={styles.choiceBadge}>{index + 1}</span>
                  <span className={styles.choiceLabel}>{choice.label}</span>
                </button>
              );
            })}
          </div>
        ) : null}
        <div className={styles.footer}>
          <div className={styles.hint}>
            <span className={styles.hintKey}>Enter</span>
            <span className={styles.hintKey}>Tap</span>
            <span>{footerLabel}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DialogueOverlay;

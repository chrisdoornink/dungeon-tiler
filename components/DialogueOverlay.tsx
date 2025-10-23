import React, { useState, useRef, useEffect } from "react";
import styles from "./DialogueOverlay.module.css";

interface DialogueChoiceOption {
  id: string;
  label: string;
}

interface TextInputConfig {
  prompt: string;
  placeholder?: string;
  maxLength?: number;
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
  textInput?: TextInputConfig;
  onTextInputSubmit?: (value: string) => void;
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
  textInput,
  onTextInputSubmit,
}) => {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  
  const displayText = renderedText.length > 0 ? renderedText : "\u00a0";
  const showCursor = isTyping && (!choices || choices.length === 0) && !textInput;
  const ariaTitle = speaker ? `${speaker}: ${text}` : text;
  const hasChoices = Boolean(choices && choices.length > 0);
  const hasTextInput = Boolean(textInput && !isTyping);
  const footerLabel = hasChoices
    ? "Choose"
    : hasTextInput
    ? "Submit"
    : isTyping
    ? "Reveal"
    : hasMore
    ? "Next"
    : "Close";
  const isHero = (speaker ?? "").toLowerCase() === "hero";

  // Auto-focus input when it appears
  useEffect(() => {
    if (hasTextInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [hasTextInput]);

  const handleOverlayClick = () => {
    if (hasChoices || hasTextInput) return;
    onAdvance();
  };
  
  const handleInputSubmit = () => {
    if (inputValue.trim()) {
      onTextInputSubmit?.(inputValue.trim());
      setInputValue("");
    }
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
                >
                  <span className={styles.choiceBadge}>{index + 1}</span>
                  <span className={styles.choiceLabel}>{choice.label}</span>
                </button>
              );
            })}
          </div>
        ) : null}
        {hasTextInput ? (
          <div className={styles.textInputContainer}>
            <label className={styles.inputLabel}>{textInput!.prompt}</label>
            <input
              ref={inputRef}
              type="text"
              className={styles.textInput}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleInputSubmit();
                }
                e.stopPropagation();
              }}
              placeholder={textInput!.placeholder}
              maxLength={textInput!.maxLength}
              onClick={(e) => e.stopPropagation()}
            />
            <button
              type="button"
              className={styles.submitButton}
              onClick={(e) => {
                e.stopPropagation();
                handleInputSubmit();
              }}
              disabled={!inputValue.trim()}
            >
              Submit
            </button>
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

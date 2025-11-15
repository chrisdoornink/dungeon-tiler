import React from 'react';
import styles from './BedInteractionModal.module.css';

interface BedInteractionModalProps {
  isOccupied: boolean;
  onSleep: () => void;
  onCancel: () => void;
}

export const BedInteractionModal: React.FC<BedInteractionModalProps> = ({
  isOccupied,
  onSleep,
  onCancel,
}) => {
  if (isOccupied) {
    return (
      <div className={styles.overlay} onClick={onCancel}>
        <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
          <h2 className={styles.title}>Occupied Bed</h2>
          <p className={styles.message}>Someone is already sleeping here.</p>
          <div className={styles.buttonContainer}>
            <button className={styles.button} onClick={onCancel}>
              Leave
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>Rest</h2>
        <p className={styles.message}>Sleep to restore your health to full.</p>
        <div className={styles.buttonContainer}>
          <button
            className={styles.button}
            onClick={onSleep}
          >
            Sleep
          </button>
          <button className={`${styles.button} ${styles.cancelButton}`} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

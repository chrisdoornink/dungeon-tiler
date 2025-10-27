import React from 'react';
import styles from './BedInteractionModal.module.css';

interface BedInteractionModalProps {
  isOccupied: boolean;
  currentTimeOfDay: 'day' | 'night';
  onSleepUntilNight: () => void;
  onSleepUntilMorning: () => void;
  onCancel: () => void;
}

export const BedInteractionModal: React.FC<BedInteractionModalProps> = ({
  isOccupied,
  currentTimeOfDay,
  onSleepUntilNight,
  onSleepUntilMorning,
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
        <p className={styles.message}>What would you like to do?</p>
        <div className={styles.buttonContainer}>
          <button
            className={styles.button}
            onClick={onSleepUntilMorning}
            disabled={currentTimeOfDay === 'day'}
          >
            Sleep until Morning
            {currentTimeOfDay === 'day' && <span className={styles.disabled}> (Already morning)</span>}
          </button>
          <button
            className={styles.button}
            onClick={onSleepUntilNight}
            disabled={currentTimeOfDay === 'night'}
          >
            Sleep until Night
            {currentTimeOfDay === 'night' && <span className={styles.disabled}> (Already night)</span>}
          </button>
          <button className={`${styles.button} ${styles.cancelButton}`} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

import type { StoryEffect } from "./event_registry";

export interface DialogueChoice {
  id: string;
  prompt: string;
  response?: DialogueLine[];
  nextDialogueId?: string;
  effects?: StoryEffect[];
}

export interface DialogueLine {
  speaker?: string;
  text: string;
  options?: DialogueChoice[];
  effects?: StoryEffect[];
}

export interface DialogueScript {
  id: string;
  lines: DialogueLine[];
  onCompleteEffects?: StoryEffect[];
}

const DIALOGUE_SCRIPTS: Record<string, DialogueScript> = {
  "elder-rowan-intro": {
    id: "elder-rowan-intro",
    lines: [
      {
        speaker: "Elder Rowan",
        text: "Ah, the torchlight finds you at last. The dungeon has been restless without a guardian.",
      },
      {
        speaker: "Hero",
        text: "Tell me what I need to know and I'll quiet its rage.",
      },
      {
        speaker: "Elder Rowan",
        text: "Trust the floor runes. Their glow marks safe footing when the shadows lie to you.",
      },
    ],
    onCompleteEffects: [{ eventId: "met-elder-rowan", value: true }],
  },
  "elder-rowan-warning-response": {
    id: "elder-rowan-warning-response",
    lines: [
      {
        speaker: "Elder Rowan",
        text: "Caretaker Lysa has always felt the sanctum breathe before the rest of us. What message did she press into your hands?",
      },
      {
        speaker: "Hero",
        text: "She warned that the sanctum's wards are thin. One misstep and the climb could swallow me whole.",
      },
      {
        speaker: "Elder Rowan",
        text: "Then let this ring anchor you. When the sanctum howls, hold your ground and listen before you leap.",
      },
    ],
    onCompleteEffects: [
      { eventId: "elder-rowan-acknowledged-warning", value: true },
    ],
  },
  "elder-rowan-post-warning": {
    id: "elder-rowan-post-warning",
    lines: [
      {
        speaker: "Elder Rowan",
        text: "Every step after the sanctum is a bargain with older things. Let Lysa's warning settle in your bones.",
      },
      {
        speaker: "Hero",
        text: "It has. I'll measure my breath and my stride.",
      },
    ],
  },
  "elder-rowan-default": {
    id: "elder-rowan-default",
    lines: [
      {
        speaker: "Elder Rowan",
        text: "The town listens for your return. Even in quiet hours the stones remember your passing.",
      },
    ],
  },
  "caretaker-lysa-overview": {
    id: "caretaker-lysa-overview",
    lines: [
      {
        speaker: "Caretaker Lysa",
        text: "Breathe. The climb past the sanctum rattles even seasoned delvers.",
      },
      {
        speaker: "Hero",
        text: "If you've kept these halls standing, I can keep moving forward.",
      },
      {
        speaker: "Caretaker Lysa",
        text: "Then keep your step light and your blade kinder still. Every rescued spirit strengthens us both.",
      },
      {
        speaker: "Caretaker Lysa",
        text: "How should I mark you down before you ascend again?",
        options: [
          {
            id: "promise-caution",
            prompt: "Promise to stay cautious",
            response: [
              {
                speaker: "Hero",
                text: "Write that I'll return when the wards are steadied.",
              },
              {
                speaker: "Caretaker Lysa",
                text: "Good. Take this ember charm—let it flare if the sanctum's floor gives way.",
              },
            ],
            effects: [{ eventId: "heard-lysa-warning", value: true }],
          },
          {
            id: "ask-for-details",
            prompt: "Ask for sanctum details",
            response: [
              {
                speaker: "Hero",
                text: "Tell me what to watch for when the sanctum turns hostile.",
              },
              {
                speaker: "Caretaker Lysa",
                text: "Listen for the hum in the stones. If it falters, stop. The next tile may be hollow.",
              },
            ],
            effects: [{ eventId: "heard-lysa-warning", value: true }],
          },
        ],
      },
    ],
  },
  "caretaker-lysa-reminder": {
    id: "caretaker-lysa-reminder",
    lines: [
      {
        speaker: "Caretaker Lysa",
        text: "You already carry my warning. Check the charm if the air tastes of ash.",
      },
      {
        speaker: "Hero",
        text: "I'll keep it close.",
      },
    ],
  },
};

export function getDialogueScript(id: string): DialogueScript | undefined {
  return DIALOGUE_SCRIPTS[id];
}

export function listDialogueScripts(): DialogueScript[] {
  return Object.values(DIALOGUE_SCRIPTS);
}

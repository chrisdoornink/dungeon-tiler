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
        text: "By the stones—you're alive. We feared the dark had swallowed you whole.",
      },
      {
        speaker: "Elder Rowan",
        text: "There will be much excitement when they hear you've returned.",
      },
      {
        speaker: "Hero",
        text: "It was a long climb out. Point me where I'm needed next.",
      },
      {
        speaker: "Elder Rowan",
        text: "Caretaker Lysa is inside the sanctum preparing for your return.",
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
  "caretaker-lysa-default": {
    id: "caretaker-lysa-default",
    lines: [
      {
        speaker: "Caretaker Lysa",
        text: "Sweep, sweep, the same old stones… sing while the dust clings to my bones…",
      },
      {
        speaker: "Caretaker Lysa",
        text: "Left to right and back once more… hush little echo on the floor…",
      },
      {
        speaker: "Caretaker Lysa",
        text: "Oh. I didn't see you there. Mind your step—the grout remembers.",
      },
    ],
  },
  "elder-rowan-awaiting-warning": {
    id: "elder-rowan-awaiting-warning",
    lines: [
      {
        speaker: "Elder Rowan",
        text: "Seek Lysa's guidance before you wander beyond the hall. She hears the sanctum's pulse before anyone else.",
      },
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
  "caretaker-lysa-intro": {
    id: "caretaker-lysa-intro",
    lines: [
      {
        speaker: "Caretaker Lysa",
        text: "I sensed your arrival today. The town was beginning to worry, but I felt your energy increasing over the last few days.",
      },
      {
        speaker: "Caretaker Lysa",
        text: "The sanctum feels wrong today—the pulse carries a weight I don't like.",
      },
      {
        speaker: "Hero",
        text: "Are you sure?",
      },
      {
        speaker: "Caretaker Lysa",
        text: "Other feel it too. The town's been uneasy. I sense a growing, negative current from the bluff northeast of the sanctum—stronger by the hour.",
      },
      {
        speaker: "Caretaker Lysa",
        text: "My companion went to look into it earlier—a boy who tends the inner torches. He hasn't returned.",
      },
      {
        speaker: "Caretaker Lysa",
        text: "Can you go check on him?",
        options: [
          {
            id: "get-directions",
            prompt: "Where should I go?",
            response: [
              {
                speaker: "Caretaker Lysa",
                text: "Just outside of this sanctum to the northeast. There is a narrow passageway leading to the bluff.",
              },
              {
                speaker: "Caretaker Lysa",
                text: "If you need supplies you can head into town first. It is a short walk north of here.",
              },
            ],
            effects: [{ eventId: "heard-missing-boy", value: true }],
          },
          {
            id: "ask-for-details",
            prompt: "What is this place?",
            response: [
              {
                speaker: "Caretaker Lysa",
                text: "This is the sanctum. We monitor the forces in the stones to keep the town safe. Recent vibration have cause concern. This is why you were sent to the caves. We need to understand what is causing the unrest before its too late",
              },
            ],
            effects: [{ eventId: "heard-missing-boy", value: true }],
          },
          {
            id: "confirm",
            prompt: "I'll go check on the boy",
            response: [
              {
                speaker: "Caretaker Lysa",
                text: "Thank you! I'll be here when you return.",
              },
            ],
            effects: [{ eventId: "heard-missing-boy", value: true }],
          },
        ],
      },
    ],
    onCompleteEffects: [
      { eventId: "met-caretaker-lysa", value: true },
      { eventId: "heard-missing-boy", value: true },
    ],
  },
  "caretaker-lysa-reminder": {
    id: "caretaker-lysa-reminder",
    lines: [
      {
        speaker: "Caretaker Lysa",
        text: "The bluff still thrums with that uneasy current. Please—find the boy and bring him back safely.",
      },
      {
        speaker: "Caretaker Lysa",
        text: "Head northeast from the sanctum entrance. The passage hugs the cliff before it opens into the caves.",
      },
    ],
  },
  "town-librarian-default": {
    id: "town-librarian-default",
    lines: [
      {
        speaker: "Librarian",
        text: "Welcome to the town hall. I'm the librarian—keeper of maps, rumors, and the quiet between.",
      },
      {
        speaker: "Librarian",
        text: "If you bring back scraps of history, I'll make space for them on our shelves.",
      },
    ],
  },
  "librarian-default": {
    id: "librarian-default",
    lines: [
      {
        speaker: "Librarian",
        text: "Welcome. How can I help you orient yourself?",
      },
    ],
  },
  "elder-rowan-missing-boy": {
    id: "elder-rowan-missing-boy",
    lines: [
      {
        speaker: "Elder Rowan",
        text: "The air has been restless all day. If Lysa sensed the bluff, go—find the boy and return together.",
      },
      {
        speaker: "Elder Rowan",
        text: "Keep your step steady. Unease is a warning—not a verdict.",
      },
    ],
  },
  "librarian-missing-boy": {
    id: "librarian-missing-boy",
    lines: [
      {
        speaker: "Librarian",
        text: "The boy from the sanctum hasn't returned? The bluff to the northeast… it's not often kind.",
      },
      {
        speaker: "Librarian",
        text: "Check the path markers north of the hall. If you find notes, bring them here and I'll catalogue the route.",
      },
    ],
  },
  "bluff-coiled-snake": {
    id: "bluff-coiled-snake",
    lines: [
      {
        speaker: "Coiled Snake",
        text: "You found me.",
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

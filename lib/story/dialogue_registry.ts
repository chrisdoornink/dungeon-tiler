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
        text: "Even others feel it too. The town's been uneasy. I sense a growing, negative current from the bluff northeast of the sanctum—stronger by the hour.",
      },
      {
        speaker: "Caretaker Lysa",
        text: "Kalen went to look into it earlier. He hasn't returned.",
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
            prompt: "I'll go check on Kalen",
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
        text: "The bluff still thrums with that uneasy current. Please—find Kalen and bring him back safely.",
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
        text: "The air has been restless all day. If Lysa sensed the bluff, go—find Kalen and return together.",
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
  // Kalen (the sanctum boy at the bluff)
  "kalen-distressed": {
    id: "kalen-distressed",
    lines: [
      { speaker: "Kalen", text: "H-help! There's a goblin—he won't let me pass!" },
      { speaker: "Kalen", text: "I was just exploring, I didn't mean to— please, make him go away!" },
    ],
  },
  "kalen-thanks-cave": {
    id: "kalen-thanks-cave",
    lines: [
      { speaker: "Kalen", text: "You... you got him! Thank you!" },
      { speaker: "Kalen", text: "I found a cave up here. I was about to look inside when the goblin cornered me." },
      { speaker: "Kalen", text: "Caretaker Lysa and the Elder will want to know what's in there. I'll head back when it's safe." },
    ],
  },
  "kalen-sanctum-default": {
    id: "kalen-sanctum-default",
    lines: [
      { speaker: "Kalen", text: "The energy flows feel different today—like the stones are humming a new tune!" },
      { speaker: "Kalen", text: "I can sense the vibrations from here. Much safer than wandering off to mysterious caves, don't you think?" },
    ],
  },
  
  // Torch Town NPCs
  "eldra-default": {
    id: "eldra-default",
    lines: [
      { speaker: "Eldra", text: "The pages whisper truths that others refuse to hear. Do you have the patience to listen?" },
    ],
  },
  "maro-default": {
    id: "maro-default",
    lines: [
      { speaker: "Maro", text: "Need supplies? I've got what you need. Just don't ask me to extend credit." },
    ],
  },
  "captain-bren-default": {
    id: "captain-bren-default",
    lines: [
      { speaker: "Captain Bren", text: "The walls hold strong, but vigilance is what keeps us safe. Stay sharp out there." },
    ],
  },
  "jorin-default": {
    id: "jorin-default",
    lines: [
      { speaker: "Jorin", text: "A good blade needs a steady hand and a hot forge. I can provide both if you need repairs." },
    ],
  },
  "yanna-default": {
    id: "yanna-default",
    lines: [
      { speaker: "Yanna", text: "The herbs speak in their own language... if you know how to listen. Most people don't." },
    ],
  },
  "serin-default": {
    id: "serin-default",
    lines: [
      { speaker: "Serin", text: "Healing takes time and care. If you're hurt, come see me. I'll do what I can." },
    ],
  },
  "rhett-default": {
    id: "rhett-default",
    lines: [
      { speaker: "Rhett", text: "The fields don't tend themselves. Hard work keeps this town fed, day after day." },
    ],
  },
  "mira-default": {
    id: "mira-default",
    lines: [
      { speaker: "Mira", text: "Every thread tells a story. What's yours, traveler?" },
    ],
  },
  "kira-default": {
    id: "kira-default",
    lines: [
      { speaker: "Kira", text: "There's so much more beyond these walls... don't you ever wonder what's out there?" },
    ],
  },
  "lio-default": {
    id: "lio-default",
    lines: [
      { speaker: "Lio", text: "The hunt keeps me sharp. Out there, hesitation means you go hungry—or worse." },
    ],
  },
  "dara-default": {
    id: "dara-default",
    lines: [
      { speaker: "Dara", text: "I've walked many roads before finding this place. Each one taught me something different." },
    ],
  },
  "sela-default": {
    id: "sela-default",
    lines: [
      { speaker: "Sela", text: "Night watch isn't for everyone. But someone's got to keep an eye on the shadows." },
    ],
  },
  "thane-default": {
    id: "thane-default",
    lines: [
      { speaker: "Thane", text: "..." },
      { speaker: "Thane", text: "*nods respectfully*" },
    ],
  },
  "fenna-default": {
    id: "fenna-default",
    lines: [
      { speaker: "Old Fenna", text: "The flame must never die. It's not just fire—it's our promise to those who came before." },
    ],
  },
  "arin-default": {
    id: "arin-default",
    lines: [
      { speaker: "Arin", text: "Wood and nails, that's all it takes to keep a roof over your head. Simple work for simple folk." },
    ],
  },
  "haro-default": {
    id: "haro-default",
    lines: [
      { speaker: "Haro", text: "My brother thinks he knows the water better than me. He's wrong, of course." },
    ],
  },
  "len-default": {
    id: "len-default",
    lines: [
      { speaker: "Len", text: "Haro's too stubborn to admit when I'm right. But the fish don't lie." },
    ],
  },
  "tavi-default": {
    id: "tavi-default",
    lines: [
      { speaker: "Tavi", text: "Wanna play? Grandma says I can't go near the walls, but we could explore the square!" },
    ],
  },
};

export function getDialogueScript(id: string): DialogueScript | undefined {
  return DIALOGUE_SCRIPTS[id];
}

export function listDialogueScripts(): DialogueScript[] {
  return Object.values(DIALOGUE_SCRIPTS);
}

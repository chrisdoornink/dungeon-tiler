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
  "torch-town-eldra-default": {
    id: "torch-town-eldra-default",
    lines: [
      {
        speaker: "Eldra",
        text: "Tread lightly among the stacks. The parchment remembers who respects it—and who misplaces ledgers.",
      },
      {
        speaker: "Eldra",
        text: "If you cross paths with Maro, remind him Serin and I still await the inventory book he swears vanished on its own.",
      },
    ],
  },
  "torch-town-maro-default": {
    id: "torch-town-maro-default",
    lines: [
      {
        speaker: "Maro",
        text: "Need something practical? Say it straight. I'm short on patience and shorter on surplus.",
      },
      {
        speaker: "Maro",
        text: "And if you see Kira near the guard tower again, send her home before Bren gives me another speech.",
      },
    ],
  },
  "torch-town-kira-default": {
    id: "torch-town-kira-default",
    lines: [
      {
        speaker: "Kira",
        text: "Bren thinks I don't notice his patrol routes, but I map them out every evening from the rooftops.",
      },
      {
        speaker: "Kira",
        text: "Eldra says curiosity should be fed with books. I prefer unlocked doors.",
      },
    ],
  },
  "torch-town-captain-bren-default": {
    id: "torch-town-captain-bren-default",
    lines: [
      {
        speaker: "Captain Bren",
        text: "The walls keep danger out, but discipline keeps peace within. I expect both from my watch.",
      },
      {
        speaker: "Captain Bren",
        text: "If you spot Yanna drifting past curfew, steer her back before the night shift does.",
      },
    ],
  },
  "torch-town-sela-default": {
    id: "torch-town-sela-default",
    lines: [
      {
        speaker: "Sela",
        text: "Training at dusk keeps the blood warm—and lets Bren think I'm following orders to the letter.",
      },
      {
        speaker: "Sela",
        text: "If you smell spiced cider on the wind, keep it between us. Maro owes me a quiet night.",
      },
    ],
  },
  "torch-town-thane-default": {
    id: "torch-town-thane-default",
    lines: [
      { speaker: "Thane", text: "..." },
      {
        speaker: "Thane",
        text: "The gate holds. I intend to keep it that way.",
      },
    ],
  },
  "torch-town-jorin-default": {
    id: "torch-town-jorin-default",
    lines: [
      {
        speaker: "Jorin",
        text: "Forge is roaring hot. Bring me raw metal and I'll hammer it into something worthy of your grip.",
      },
      {
        speaker: "Jorin",
        text: "If Yanna drifts past muttering about spores, drag her back before she singes her skirts again.",
      },
    ],
  },
  "torch-town-yanna-default": {
    id: "torch-town-yanna-default",
    lines: [
      {
        speaker: "Yanna",
        text: "These herbs hum when the moon leans close. Fenna swears it's ominous; I say it's a doorway.",
      },
      {
        speaker: "Yanna",
        text: "If you gather petals beyond the walls, keep them shaded. The flame reacts poorly to sudden change.",
      },
    ],
  },
  "torch-town-serin-default": {
    id: "torch-town-serin-default",
    lines: [
      {
        speaker: "Serin",
        text: "Sit a moment. Let me see the strain in your shoulders before it settles deeper.",
      },
      {
        speaker: "Serin",
        text: "Dara still sleeps lightly. If you speak with them, offer kindness before questions.",
      },
    ],
  },
  "torch-town-rhett-default": {
    id: "torch-town-rhett-default",
    lines: [
      {
        speaker: "Rhett",
        text: "Soil's thin this season. Every stalk we coax up is another day the town eats.",
      },
      {
        speaker: "Rhett",
        text: "Tell Lio the fields aren't a larder for his hunts. If he wants venison, let him stalk it proper.",
      },
    ],
  },
  "torch-town-mira-default": {
    id: "torch-town-mira-default",
    lines: [
      {
        speaker: "Mira",
        text: "The loom sings when gossip is good. Sit—I'll trade you a shawl for a secret worth weaving.",
      },
      {
        speaker: "Mira",
        text: "Rhett pretends he doesn't listen, but he knows every thread I spin keeps his shoulders covered.",
      },
    ],
  },
  "torch-town-lio-default": {
    id: "torch-town-lio-default",
    lines: [
      {
        speaker: "Lio",
        text: "The ridgeline is quiet today—too quiet. I might slip beyond the torches after dusk.",
      },
      {
        speaker: "Lio",
        text: "If Rhett asks, I brought those herbs to his doorstep. He just beat me there in the telling.",
      },
    ],
  },
  "torch-town-dara-default": {
    id: "torch-town-dara-default",
    lines: [
      {
        speaker: "Dara",
        text: "The town listens. Some with welcome, some with wary glances—but warmth is better than the night.",
      },
      {
        speaker: "Dara",
        text: "I'll linger near the fire until the walls feel like home. Share a story if you have one to spare.",
      },
    ],
  },
  "torch-town-old-fenna-default": {
    id: "torch-town-old-fenna-default",
    lines: [
      {
        speaker: "Old Fenna",
        text: "Keep your shadow clear of the flame. Every breath it takes keeps the town in step.",
      },
      {
        speaker: "Old Fenna",
        text: "Yanna thinks her tinctures strengthen it. Hah. Tradition burns steadier than any experiment.",
      },
    ],
  },
  "torch-town-arin-default": {
    id: "torch-town-arin-default",
    lines: [
      {
        speaker: "Arin",
        text: "If a beam creaks, I hear it before dawn. These homes stand because I never sleep easy.",
      },
      {
        speaker: "Arin",
        text: "Mira's laughter carries across the yard. I fix things so she never has to patch splinters into cloth.",
      },
    ],
  },
  "torch-town-haro-default": {
    id: "torch-town-haro-default",
    lines: [
      {
        speaker: "Haro",
        text: "River's low but the nets hold. If Len would stop complaining, we'd haul twice the catch.",
      },
      {
        speaker: "Haro",
        text: "Bring me a good lure and I'll trade you smoked fish. Bring me Len's attitude and you'll get tossed in.",
      },
    ],
  },
  "torch-town-len-default": {
    id: "torch-town-len-default",
    lines: [
      {
        speaker: "Len",
        text: "Haro thinks he's captain of the dock. I'm the one who patches the nets when he shreds them.",
      },
      {
        speaker: "Len",
        text: "If you hear splashing, it's just me proving him wrong again.",
      },
    ],
  },
  "torch-town-tavi-default": {
    id: "torch-town-tavi-default",
    lines: [
      {
        speaker: "Tavi",
        text: "Look! The sparks chase me when I dance. Grandma says I'm faster than the flame.",
      },
      {
        speaker: "Tavi",
        text: "Want to play tag around the plaza? I'll show you all the hiding spots before the guards notice.",
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
};

export function getDialogueScript(id: string): DialogueScript | undefined {
  return DIALOGUE_SCRIPTS[id];
}

export function listDialogueScripts(): DialogueScript[] {
  return Object.values(DIALOGUE_SCRIPTS);
}

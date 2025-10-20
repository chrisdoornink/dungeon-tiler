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
  "caretaker-lysa-kalen-rescued": {
    id: "caretaker-lysa-kalen-rescued",
    lines: [
      {
        speaker: "Caretaker Lysa",
        text: "Thank the stones—Kalen returned safely. You have my deepest gratitude.",
      },
      {
        speaker: "Caretaker Lysa",
        text: "He spoke of a cave at the bluff. I recall old stories... whispers of passages beneath those cliffs.",
      },
      {
        speaker: "Caretaker Lysa",
        text: "You might want to ask around in the town for more details. I'm sure the librarian will have some old maps or stories to share.",
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
  "elder-rowan-kalen-rescued": {
    id: "elder-rowan-kalen-rescued",
    lines: [
      {
        speaker: "Elder Rowan",
        text: "Kalen is safe—you've done well. The boy's curiosity nearly cost him dearly.",
      },
      {
        speaker: "Elder Rowan",
        text: "He mentioned a cave at the bluff. I've kept watch over this sanctum for decades, but even I didn't know of passages there.",
      },
      {
        speaker: "Elder Rowan",
        text: "The air still feels... watchful. I'll remain here at the entrance. Something stirs beyond our walls.",
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
        speaker: "Ancient Serpent",
        text: "Sssso... you have found me, traveler. Few venture thisss far into the eassstern cavesss.",
      },
      {
        speaker: "Ancient Serpent",
        text: "I possess something you sssseek—a gift that bends sssspace itself. But wisdom, not sssteel, earns my favor.",
      },
      {
        speaker: "Ancient Serpent",
        text: "Answer my riddles three, and the power to traverse great dissstances shall be yoursss. Fail, and you mussst leave empty-handed.",
      },
      {
        speaker: "Ancient Serpent",
        text: "First riddle: I am answered when unspoken, broken when you build me. What am I?",
        options: [
          { id: "promise", prompt: "A promise", nextDialogueId: "snake-riddle-1-wrong" },
          { id: "secret", prompt: "A secret", nextDialogueId: "snake-riddle-1-wrong" },
          { id: "silence", prompt: "Silence", nextDialogueId: "snake-riddle-1-correct" },
          { id: "trust", prompt: "Trust", nextDialogueId: "snake-riddle-1-wrong" },
        ],
      },
    ],
  },
  "snake-riddle-1-correct": {
    id: "snake-riddle-1-correct",
    lines: [
      {
        speaker: "Ancient Serpent",
        text: "Yesss... ssilence indeed. You understand the firssst lesssson.",
      },
      {
        speaker: "Ancient Serpent",
        text: "Second riddle: I follow without sssteps, flee without fear, and die at midnight. What am I?",
        options: [
          { id: "dream", prompt: "A dream", nextDialogueId: "snake-riddle-2-wrong" },
          { id: "fear", prompt: "Fear", nextDialogueId: "snake-riddle-2-wrong" },
          { id: "ghost", prompt: "A ghost", nextDialogueId: "snake-riddle-2-wrong" },
          { id: "shadow", prompt: "Shadow", nextDialogueId: "snake-riddle-2-correct" },
        ],
      },
    ],
  },
  "snake-riddle-1-wrong": {
    id: "snake-riddle-1-wrong",
    lines: [
      {
        speaker: "Ancient Serpent",
        text: "No... that isss not the answer. You have not yet learned to lisssen.",
      },
      {
        speaker: "Ancient Serpent",
        text: "Return when you have gained more wisssdom, traveler.",
      },
    ],
  },
  "snake-riddle-2-correct": {
    id: "snake-riddle-2-correct",
    lines: [
      {
        speaker: "Ancient Serpent",
        text: "Correct again. The ssshadow knows no fear, yet flees from light.",
      },
      {
        speaker: "Ancient Serpent",
        text: "Third riddle: I fill a room yet take no sssspace. What am I?",
        options: [
          { id: "air", prompt: "Air", nextDialogueId: "snake-riddle-3-wrong" },
          { id: "darkness", prompt: "Darkness", nextDialogueId: "snake-riddle-3-wrong" },
          { id: "light", prompt: "Light", nextDialogueId: "snake-riddle-3-correct" },
          { id: "sound", prompt: "Sound", nextDialogueId: "snake-riddle-3-wrong" },
          ],
      },
    ],
  },
  "snake-riddle-2-wrong": {
    id: "snake-riddle-2-wrong",
    lines: [
      {
        speaker: "Ancient Serpent",
        text: "Incorrect. You have failed the sssecond test.",
      },
      {
        speaker: "Ancient Serpent",
        text: "Sssseek more knowledge before you return, traveler.",
      },
    ],
  },
  "snake-riddle-3-correct": {
    id: "snake-riddle-3-correct",
    lines: [
      {
        speaker: "Ancient Serpent",
        text: "Excellent. Light indeed fillsss all, yet weighs nothing.",
      },
      {
        speaker: "Ancient Serpent",
        text: "Fourth riddle: I move without legsss, ssspend without coin, and eat all thingsss. What am I?",
        options: [
          { id: "fire", prompt: "Fire", nextDialogueId: "snake-riddle-4-wrong" },
          { id: "time", prompt: "Time", nextDialogueId: "snake-riddle-4-correct" },
          { id: "water", prompt: "Water", nextDialogueId: "snake-riddle-4-wrong" },
          { id: "wind", prompt: "Wind", nextDialogueId: "snake-riddle-4-wrong" },
        ],
      },
    ],
  },
  "snake-riddle-3-wrong": {
    id: "snake-riddle-3-wrong",
    lines: [
      {
        speaker: "Ancient Serpent",
        text: "No. You were sssso close, yet you have failed.",
      },
      {
        speaker: "Ancient Serpent",
        text: "Return when you can sssee what isss before you.",
      },
    ],
  },
  "snake-riddle-4-correct": {
    id: "snake-riddle-4-correct",
    lines: [
      {
        speaker: "Ancient Serpent",
        text: "Wissse indeed. Time consumesss all, yet cannot be held.",
      },
      {
        speaker: "Ancient Serpent",
        text: "Final riddle: I ssspeak when you don't, but only after you do. What am I?",
        options: [
          { id: "conscience", prompt: "Conscience", nextDialogueId: "snake-riddle-5-wrong" },
          { id: "echo", prompt: "Echo", nextDialogueId: "snake-riddle-5-correct" },
          { id: "memory", prompt: "Memory", nextDialogueId: "snake-riddle-5-wrong" },
          { id: "reflection", prompt: "Reflection", nextDialogueId: "snake-riddle-5-wrong" },
        ],
      },
    ],
  },
  "snake-riddle-4-wrong": {
    id: "snake-riddle-4-wrong",
    lines: [
      {
        speaker: "Ancient Serpent",
        text: "Wrong. Time hasss not taught you enough.",
      },
      {
        speaker: "Ancient Serpent",
        text: "Come back when you have learned more, traveler.",
      },
    ],
  },
  "snake-riddle-5-correct": {
    id: "snake-riddle-5-correct",
    lines: [
      {
        speaker: "Ancient Serpent",
        text: "Yesss! The echo... the final lesssson. You have proven your wisssdom.",
      },
      {
        speaker: "Ancient Serpent",
        text: "You have earned the gift I guard. Take thisss rune of teleportation—it will carry you acrosss great dissstances in an instant.",
        effects: [
          { eventId: "snake-riddles-completed", value: true },
        ],
      },
      {
        speaker: "Ancient Serpent",
        text: "Use it wisely, traveler. May your journey be sswift.",
      },
    ],
  },
  "snake-riddle-5-wrong": {
    id: "snake-riddle-5-wrong",
    lines: [
      {
        speaker: "Ancient Serpent",
        text: "No... you were sssso close. The final answer eludesss you.",
      },
      {
        speaker: "Ancient Serpent",
        text: "Return when the echo of wisssdom ssspeaks to you.",
      },
    ],
  },
  "snake-already-completed": {
    id: "snake-already-completed",
    lines: [
      {
        speaker: "Ancient Serpent",
        text: "You have already proven your wisssdom, traveler.",
      },
      {
        speaker: "Ancient Serpent",
        text: "The gift hasss been given. Use it well.",
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
      { speaker: "Old Fenna", text: "Welcome, traveler. I am Old Fenna, keeper of the eternal flame." },
      { speaker: "Old Fenna", text: "The flame has been restless lately—flickering, dancing with unease. In all my years, I've learned it never lies." },
      { speaker: "Old Fenna", text: "Something dark stirs beyond our eastern walls. The flame shows me shadows gathering, growing bolder." },
      { speaker: "Old Fenna", text: "Speak with the townsfolk. They feel it too, though some try to ignore the signs." },
    ],
    onCompleteEffects: [{ eventId: "met-old-fenna-torch-town", value: true }],
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

  // Bluff Cave Awareness - NPCs who know about the cave and hint at library resources
  "eldra-cave-hint": {
    id: "eldra-cave-hint",
    lines: [
      { speaker: "Eldra", text: "Word travels fast in a small town. I heard you ventured into the cave at the bluff." },
      { speaker: "Eldra", text: "If you're looking for context about what you found there, the archives might hold something. Old maps, geological surveys... the usual dusty treasures." },
    ],
  },
  "captain-bren-cave-hint": {
    id: "captain-bren-cave-hint",
    lines: [
      { speaker: "Captain Bren", text: "So you found a cave up at the bluff. I've heard rumors of passages in those cliffs for years." },
      { speaker: "Captain Bren", text: "If you want to know more, Eldra keeps records of old expeditions in the library. Might be worth a look." },
    ],
  },
  "dara-cave-hint": {
    id: "dara-cave-hint",
    lines: [
      { speaker: "Dara", text: "A cave at the bluff? I've traveled many roads, but I hadn't heard of that one." },
      { speaker: "Dara", text: "In my experience, caves like that often have histories. Check the town's library—old places like this usually keep records." },
    ],
  },
  "lio-cave-hint": {
    id: "lio-cave-hint",
    lines: [
      { speaker: "Lio", text: "I've hunted near the bluff for years. Never knew there was a cave up there." },
      { speaker: "Lio", text: "If you're curious about what's inside, the library might have old survey maps. Eldra's good at digging up that sort of thing." },
    ],
  },

  // Kalen Rescue Awareness - NPCs who heard about the rescue
  "maro-kalen-rescue": {
    id: "maro-kalen-rescue",
    lines: [
      { speaker: "Maro", text: "I heard you pulled Kalen out of trouble at the bluff. Good work—that boy's got more curiosity than sense." },
      { speaker: "Maro", text: "If you need supplies for your next venture, you know where to find me." },
    ],
  },
  "yanna-kalen-rescue": {
    id: "yanna-kalen-rescue",
    lines: [
      { speaker: "Yanna", text: "The herbs told me someone was in danger near the bluff. I'm glad you found Kalen in time." },
      { speaker: "Yanna", text: "The land speaks to those who listen. You listened well." },
    ],
  },
  "serin-kalen-rescue": {
    id: "serin-kalen-rescue",
    lines: [
      { speaker: "Serin", text: "I heard you rescued Kalen from the bluff. Thank you for bringing him back safely." },
      { speaker: "Serin", text: "If you ever need healing after your adventures, my door is always open." },
    ],
  },
  "mira-kalen-rescue": {
    id: "mira-kalen-rescue",
    lines: [
      { speaker: "Mira", text: "Word is you saved Kalen from a goblin at the bluff. That's quite the tale to weave!" },
      { speaker: "Mira", text: "Every thread tells a story, and yours is becoming quite interesting." },
    ],
  },
  "kira-kalen-rescue": {
    id: "kira-kalen-rescue",
    lines: [
      { speaker: "Kira", text: "You rescued Kalen? That's amazing! I wish I could go on adventures like that." },
      { speaker: "Kira", text: "Maybe one day I'll get to see what's beyond these walls too." },
    ],
  },
  "fenna-kalen-rescue": {
    id: "fenna-kalen-rescue",
    lines: [
      { speaker: "Old Fenna", text: "The flame showed me your deed at the bluff—bringing Kalen back from danger." },
      { speaker: "Old Fenna", text: "The flame honors those who protect the young. You have its blessing." },
    ],
  },
  "rhett-kalen-rescue": {
    id: "rhett-kalen-rescue",
    lines: [
      { speaker: "Rhett", text: "Heard you saved the sanctum boy from trouble. Good on you." },
      { speaker: "Rhett", text: "Hard work and helping others—that's what keeps a community strong." },
    ],
  },

  // Goblin Activity - NPCs discussing increased monster activity (after Kalen rescue)
  "eldra-goblin-activity": {
    id: "eldra-goblin-activity",
    lines: [
      { speaker: "Eldra", text: "The pages whisper of dark times ahead. Goblins at our gates, shadows creeping closer..." },
      { speaker: "Eldra", text: "I trust only Serin's judgment in these matters. The others panic too easily." },
      { speaker: "Eldra", text: "If you venture east beyond the walls, tread carefully. The darkness grows bolder." },
    ],
  },
  "maro-goblin-activity": {
    id: "maro-goblin-activity",
    lines: [
      { speaker: "Maro", text: "Business has been slow. People are scared to venture out with all these goblins lurking around." },
      { speaker: "Maro", text: "That librarian Eldra keeps muttering about 'ancient warnings' and 'lost records.' Bah! We need action, not dusty books." },
      { speaker: "Maro", text: "If you're brave enough to investigate the eastern wilds, stock up first. I won't have your death on my conscience." },
    ],
  },
  "captain-bren-goblin-activity": {
    id: "captain-bren-goblin-activity",
    lines: [
      { speaker: "Captain Bren", text: "The eastern gate has seen more activity than usual. Goblins, mostly—more organized than they should be." },
      { speaker: "Captain Bren", text: "Jorin's been helping reinforce our equipment, but I worry about Yanna wandering off to forage. That woman has no sense of danger." },
      { speaker: "Captain Bren", text: "If you're heading out there, we could use someone to scout the area. Find out what's stirring them up." },
    ],
  },
  "jorin-goblin-activity": {
    id: "jorin-goblin-activity",
    lines: [
      { speaker: "Jorin", text: "Ha! More monsters means more work for me. Every guard in town needs their blade sharpened." },
      { speaker: "Jorin", text: "Listen—if you bring me 20 stones, good solid ones, I'll forge you a proper sword. Better than anything you'll find out there." },
      { speaker: "Jorin", text: "The eastern wilds are crawling with goblins. Perfect place to test your mettle and gather materials." },
    ],
  },
  "yanna-goblin-activity": {
    id: "yanna-goblin-activity",
    lines: [
      { speaker: "Yanna", text: "The herbs near the eastern gate have been... whispering. They sense the corruption spreading." },
      { speaker: "Yanna", text: "Goblins are just symptoms. Something deeper is wrong. The land itself feels sick." },
      { speaker: "Yanna", text: "If you investigate, bring me samples of anything unusual you find. Plants, soil, anything touched by darkness." },
    ],
  },
  "serin-goblin-activity": {
    id: "serin-goblin-activity",
    lines: [
      { speaker: "Serin", text: "I've been treating more injuries lately. Guards coming back from the eastern gate, mostly." },
      { speaker: "Serin", text: "Eldra confides in me about her concerns. She's not wrong—something is stirring out there." },
      { speaker: "Serin", text: "If you plan to investigate, please be careful. I'd rather prevent wounds than heal them." },
    ],
  },
  "rhett-goblin-activity": {
    id: "rhett-goblin-activity",
    lines: [
      { speaker: "Rhett", text: "Can't work the eastern fields anymore. Too many goblins prowling around." },
      { speaker: "Rhett", text: "Mira says I'm being paranoid, but I've seen them. More every day." },
      { speaker: "Rhett", text: "Someone needs to clear them out before we lose the harvest. If you're able, the town would be grateful." },
    ],
  },
  "mira-goblin-activity": {
    id: "mira-goblin-activity",
    lines: [
      { speaker: "Mira", text: "Rhett's been on edge about the goblins. I tell him to focus on what he can control, but he worries." },
      { speaker: "Mira", text: "Every thread tells a story, and lately the threads have been dark. Danger, uncertainty, fear..." },
      { speaker: "Mira", text: "If you venture east, you'll be weaving yourself into this tale. Make sure it has a good ending." },
    ],
  },
  "kira-goblin-activity": {
    id: "kira-goblin-activity",
    lines: [
      { speaker: "Kira", text: "Uncle Maro won't let me near the eastern gate anymore. He says it's too dangerous." },
      { speaker: "Kira", text: "But I've seen the guards coming back. They look... worried. What's really out there?" },
      { speaker: "Kira", text: "I wish I could help, but Uncle says I'm too young. Maybe you could investigate for us?" },
    ],
  },
  "lio-goblin-activity": {
    id: "lio-goblin-activity",
    lines: [
      { speaker: "Lio", text: "Hunting's been impossible lately. The goblins have scared off all the game." },
      { speaker: "Lio", text: "I've tracked their movements—they're gathering east of town, near the wilds. Something's organizing them." },
      { speaker: "Lio", text: "If you're a fighter, that's where you need to go. Hunt the hunters, if you catch my meaning." },
    ],
  },
  "dara-goblin-activity": {
    id: "dara-goblin-activity",
    lines: [
      { speaker: "Dara", text: "I've walked many roads and seen many threats. This goblin activity reminds me of darker times." },
      { speaker: "Dara", text: "In my experience, when monsters gather like this, there's always a cause. A leader, a corruption, something." },
      { speaker: "Dara", text: "The eastern wilds hold answers. But answers often come with a price." },
    ],
  },
  "sela-goblin-activity": {
    id: "sela-goblin-activity",
    lines: [
      { speaker: "Sela", text: "Night watch has been tense. We hear them out there, beyond the walls. Goblins, definitely." },
      { speaker: "Sela", text: "Captain Bren has us on high alert. The eastern gate especially—that's where they're most active." },
      { speaker: "Sela", text: "If you're planning to investigate, go during the day. Night belongs to them now." },
    ],
  },
  "thane-goblin-activity": {
    id: "thane-goblin-activity",
    lines: [
      { speaker: "Thane", text: "..." },
      { speaker: "Thane", text: "*points east with concern*" },
      { speaker: "Thane", text: "*makes a slashing gesture, then nods encouragingly*" },
    ],
  },
  "fenna-goblin-activity": {
    id: "fenna-goblin-activity",
    lines: [
      { speaker: "Old Fenna", text: "The flame flickers when danger approaches. It's been restless for days now." },
      { speaker: "Fenna", text: "Goblins at our gates... I've seen this before, long ago. It never ends well unless someone acts." },
      { speaker: "Fenna", text: "The flame shows me a path to the east. Someone must walk it, or the darkness will consume us all." },
    ],
  },
  "arin-goblin-activity": {
    id: "arin-goblin-activity",
    lines: [
      { speaker: "Arin", text: "Been reinforcing the eastern wall. Goblins keep testing our defenses." },
      { speaker: "Arin", text: "Simple work, but necessary. Though I'd rather be building than fortifying." },
      { speaker: "Arin", text: "If someone could deal with the source of this problem, we could get back to normal life." },
    ],
  },
  "haro-goblin-activity": {
    id: "haro-goblin-activity",
    lines: [
      { speaker: "Haro", text: "The fish have been scarce. Even they know something's wrong." },
      { speaker: "Haro", text: "Len thinks I'm imagining things, but the water doesn't lie. There's darkness spreading from the east." },
      { speaker: "Haro", text: "Someone needs to investigate before it reaches the town." },
    ],
  },
  "len-goblin-activity": {
    id: "len-goblin-activity",
    lines: [
      { speaker: "Len", text: "Haro's been going on about 'darkness in the water.' I think he's been in the sun too long." },
      { speaker: "Len", text: "But... the fish have been acting strange. And those goblins at the eastern gate are real enough." },
      { speaker: "Len", text: "Maybe Haro's right for once. Maybe someone should check it out." },
    ],
  },
  "tavi-goblin-activity": {
    id: "tavi-goblin-activity",
    lines: [
      { speaker: "Tavi", text: "Grandma won't let me play near the walls anymore. She says there are monsters." },
      { speaker: "Tavi", text: "Are you gonna go fight them? That would be so cool!" },
      { speaker: "Tavi", text: "Be careful though. Grandma says heroes are brave, but smart heroes come home." },
    ],
  },
};

export function getDialogueScript(id: string): DialogueScript | undefined {
  return DIALOGUE_SCRIPTS[id];
}

export function listDialogueScripts(): DialogueScript[] {
  return Object.values(DIALOGUE_SCRIPTS);
}

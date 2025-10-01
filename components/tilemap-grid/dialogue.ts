import type { NPCInteractionEvent } from "../../lib/npc";
import type { DialogueLine } from "../../lib/story/dialogue_registry";

export type DialogueSession = {
  event: NPCInteractionEvent;
  script: DialogueLine[];
  lineIndex: number;
  dialogueId: string;
  consumedScriptIds: string[];
};

export function cloneDialogueLines(lines: DialogueLine[]): DialogueLine[] {
  return lines.map((line) => ({
    ...line,
    options: line.options
      ? line.options.map((option) => ({
          ...option,
          response: option.response
            ? cloneDialogueLines(option.response)
            : undefined,
        }))
      : undefined,
  }));
}

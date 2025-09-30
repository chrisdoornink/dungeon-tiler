import type { DialogueLine } from "./dialogue_registry";

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

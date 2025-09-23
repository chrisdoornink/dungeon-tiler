import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import DialogueOverlay from "../../components/DialogueOverlay";
import "@testing-library/jest-dom";

describe("DialogueOverlay", () => {
  const baseProps = {
    speaker: "Elder Rowan",
    text: "Welcome, hero.",
    renderedText: "Welcome, hero.",
    isTyping: false,
    hasMore: true,
    onAdvance: jest.fn(),
  };

  it("renders dialogue text with pixel font", () => {
    render(<DialogueOverlay {...baseProps} />);
    const text = screen.getByTestId("dialogue-text");
    expect(text).toHaveTextContent("Welcome, hero.");
    expect(screen.getByTestId("dialogue-overlay"))
      .toHaveAttribute("aria-label", "Elder Rowan: Welcome, hero.");
  });

  it("shows the typing cursor when still animating", () => {
    render(<DialogueOverlay {...baseProps} renderedText="Welc" isTyping={true} />);
    const cursor = screen.getByText("▌");
    expect(cursor).toBeInTheDocument();
  });

  it("invokes onAdvance when clicked", () => {
    const onAdvance = jest.fn();
    render(<DialogueOverlay {...baseProps} onAdvance={onAdvance} />);
    fireEvent.click(screen.getByTestId("dialogue-overlay"));
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it("renders selectable choices and handles selection", () => {
    const onSelectChoice = jest.fn();
    const onAdvance = jest.fn();
    render(
      <DialogueOverlay
        {...baseProps}
        choices={[
          { id: "a", label: "Affirm the warning" },
          { id: "b", label: "Ask for details" },
        ]}
        selectedChoiceIndex={1}
        onSelectChoice={onSelectChoice}
        onAdvance={onAdvance}
      />
    );
    expect(screen.getByRole("listbox", { name: "Responses" })).toBeInTheDocument();
    const options = screen.getAllByRole("button");
    expect(options).toHaveLength(2);
    fireEvent.click(options[0]);
    expect(onSelectChoice).toHaveBeenCalledWith("a");
    // Clicking overlay should not trigger advance while choices are visible
    fireEvent.click(screen.getByTestId("dialogue-overlay"));
    expect(onAdvance).not.toHaveBeenCalled();
  });
});

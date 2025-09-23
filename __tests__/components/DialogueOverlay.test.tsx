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
});

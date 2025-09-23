import React from "react";
import { render, screen, act } from "@testing-library/react";
import { useTypewriter, type TypewriterState } from "../../lib/dialogue/useTypewriter";
import "@testing-library/jest-dom";

describe("useTypewriter", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const TestHarness: React.FC<{
    text: string;
    interval?: number;
    onState?: (state: TypewriterState) => void;
  }> = ({ text, interval = 10, onState }) => {
    const state = useTypewriter(text, interval);
    if (onState) {
      onState(state);
    }
    return (
      <div data-testid="typer-output" data-typing={state.isTyping}>
        {state.rendered}
      </div>
    );
  };

  it("reveals characters over time", () => {
    render(<TestHarness text="Hi" interval={8} />);

    const output = screen.getByTestId("typer-output");
    expect(output).toHaveTextContent("");

    act(() => {
      jest.advanceTimersByTime(8);
    });
    expect(output).toHaveTextContent("H");

    act(() => {
      jest.advanceTimersByTime(8);
    });
    expect(output).toHaveTextContent("Hi");
    expect(output.getAttribute("data-typing")).toBe("false");
  });

  it("skips to the end when requested", () => {
    let latest: TypewriterState | null = null;
    render(
      <TestHarness
        text="Skip"
        interval={10}
        onState={(state) => {
          latest = state;
        }}
      />
    );

    const output = screen.getByTestId("typer-output");
    expect(output).toHaveTextContent("");

    act(() => {
      latest?.skip();
    });

    expect(output).toHaveTextContent("Skip");
    expect(latest?.isTyping).toBe(false);
  });

  it("resets when the source text changes", () => {
    let latest: TypewriterState | null = null;
    const { rerender } = render(
      <TestHarness text="Old" interval={6} onState={(state) => (latest = state)} />
    );
    const output = screen.getByTestId("typer-output");

    act(() => {
      latest?.skip();
      jest.runAllTimers();
    });
    expect(output).toHaveTextContent("Old");

    rerender(
      <TestHarness text="New" interval={6} onState={(state) => (latest = state)} />
    );
    expect(output).toHaveTextContent("");

    act(() => {
      jest.advanceTimersByTime(6);
    });
    expect(output).toHaveTextContent("N");
  });
});

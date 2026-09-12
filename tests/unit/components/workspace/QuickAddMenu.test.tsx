import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { QuickAddMenu } from "@/components/workspace/QuickAddMenu";

describe("QuickAddMenu", () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    anchor: { x: 300, y: 400 },
    onQuickCreateTask: vi.fn(),
    onPickExistingTask: vi.fn(),
    onAddHabit: vi.fn(),
    onAddEvent: vi.fn(),
    onAddFocus: vi.fn(),
    onFitView: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders input and all menu items when open is true", () => {
    render(<QuickAddMenu {...defaultProps} />);

    expect(screen.getByTestId("quick-add-menu")).toBeDefined();
    expect(screen.getByTestId("quick-add-task-input")).toBeDefined();
    expect(screen.getByTestId("quick-add-pick-task")).toBeDefined();
    expect(screen.getByTestId("quick-add-habit")).toBeDefined();
    expect(screen.getByTestId("quick-add-event")).toBeDefined();
    expect(screen.getByTestId("quick-add-focus")).toBeDefined();
    expect(screen.getByTestId("quick-add-fit-view")).toBeDefined();
  });

  it("does not render when anchor is null", () => {
    render(<QuickAddMenu {...defaultProps} anchor={null} />);
    expect(screen.queryByTestId("quick-add-menu")).toBeNull();
  });

  it("submits new task on Enter key when title is non-empty", () => {
    render(<QuickAddMenu {...defaultProps} />);

    const input = screen.getByTestId("quick-add-task-input");
    fireEvent.change(input, { target: { value: "Review PR #42" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(defaultProps.onQuickCreateTask).toHaveBeenCalledWith(
      "Review PR #42",
    );
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("does not submit empty or whitespace-only task title", () => {
    render(<QuickAddMenu {...defaultProps} />);

    const input = screen.getByTestId("quick-add-task-input");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(defaultProps.onQuickCreateTask).not.toHaveBeenCalled();
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape key in input", () => {
    render(<QuickAddMenu {...defaultProps} />);

    const input = screen.getByTestId("quick-add-task-input");
    fireEvent.keyDown(input, { key: "Escape" });

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("invokes onPickExistingTask when clicking pick task item", () => {
    render(<QuickAddMenu {...defaultProps} />);

    fireEvent.click(screen.getByTestId("quick-add-pick-task"));
    expect(defaultProps.onPickExistingTask).toHaveBeenCalled();
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("invokes onAddHabit when clicking add habit item", () => {
    render(<QuickAddMenu {...defaultProps} />);

    fireEvent.click(screen.getByTestId("quick-add-habit"));
    expect(defaultProps.onAddHabit).toHaveBeenCalled();
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("invokes onAddEvent when clicking add event item", () => {
    render(<QuickAddMenu {...defaultProps} />);

    fireEvent.click(screen.getByTestId("quick-add-event"));
    expect(defaultProps.onAddEvent).toHaveBeenCalled();
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("invokes onAddFocus when clicking add focus item", () => {
    render(<QuickAddMenu {...defaultProps} />);

    fireEvent.click(screen.getByTestId("quick-add-focus"));
    expect(defaultProps.onAddFocus).toHaveBeenCalled();
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("invokes onFitView when clicking fit view item", () => {
    render(<QuickAddMenu {...defaultProps} />);

    fireEvent.click(screen.getByTestId("quick-add-fit-view"));
    expect(defaultProps.onFitView).toHaveBeenCalled();
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("allows keyboard navigation with ArrowDown and ArrowUp between input and items", () => {
    render(<QuickAddMenu {...defaultProps} />);

    const input = screen.getByTestId("quick-add-task-input");
    const firstItem = screen.getByTestId("quick-add-pick-task");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(firstItem, { key: "ArrowUp" });
  });
});

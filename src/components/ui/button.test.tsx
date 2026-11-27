import { fireEvent, render, screen } from "@testing-library/react";
import type { FormEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "@/components/ui/button";

describe("shared Button", () => {
  it("runs click handlers without submitting a surrounding form by default", () => {
    const onClick = vi.fn();
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault());

    render(
      <form onSubmit={onSubmit}>
        <Button onClick={onClick}>Abrir painel</Button>
      </form>,
    );

    const button = screen.getByRole("button", { name: "Abrir painel" });
    expect(button).toHaveAttribute("type", "button");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("preserves explicit submit buttons", () => {
    render(
      <form>
        <Button type="submit">Guardar</Button>
      </form>,
    );

    expect(screen.getByRole("button", { name: "Guardar" })).toHaveAttribute("type", "submit");
  });
});

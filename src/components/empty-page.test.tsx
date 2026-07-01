// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { EmptyPage } from "./empty-page";

afterEach(cleanup);

describe("EmptyPage", () => {
  it("renders a title and pending module state", () => {
    render(<EmptyPage description="Descripcion" title="Movimientos" />);

    expect(screen.getByRole("heading", { name: "Movimientos" })).toBeInTheDocument();
    expect(screen.getByText("Modulo pendiente de implementacion.")).toBeInTheDocument();
  });
});

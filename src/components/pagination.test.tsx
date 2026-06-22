// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Pagination } from "./pagination";

afterEach(cleanup);

describe("Pagination", () => {
  it("no renderiza nada si solo hay una pagina", () => {
    const { container } = render(<Pagination buildHref={(page) => `/x?page=${page}`} page={1} pages={1} />);
    expect(container.firstChild).toBeNull();
  });

  it("muestra todos los numeros cuando hay pocas paginas", () => {
    render(<Pagination buildHref={(page) => `/x?page=${page}`} page={2} pages={4} />);

    [1, 2, 3, 4].forEach((page) => {
      expect(screen.getByRole("link", { name: String(page) })).toHaveAttribute("href", `/x?page=${page}`);
    });
    expect(screen.getByRole("link", { name: "Anterior" })).toHaveAttribute("href", "/x?page=1");
    expect(screen.getByRole("link", { name: "Siguiente" })).toHaveAttribute("href", "/x?page=3");
  });

  it("omite Anterior en la primera pagina y Siguiente en la ultima", () => {
    render(<Pagination buildHref={(page) => `/x?page=${page}`} page={1} pages={3} />);
    expect(screen.queryByRole("link", { name: "Anterior" })).toBeNull();
    expect(screen.getByRole("link", { name: "Siguiente" })).toBeInTheDocument();
  });

  it("usa elipsis cuando hay muchas paginas lejos de la actual", () => {
    render(<Pagination buildHref={(page) => `/x?page=${page}`} page={10} pages={20} />);

    expect(screen.getByRole("link", { name: "1" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "20" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "5" })).toBeNull();
    expect(screen.getAllByText("…").length).toBeGreaterThan(0);
  });
});

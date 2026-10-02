import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { auth } from "@clerk/nextjs/server";

import Page from "./page";

vi.mock("@clerk/nextjs/server", () => ({
  auth: { protect: vi.fn() },
}));

describe("legal case tracker home page", () => {
  it("renders the product heading", async () => {
    render(await Page());

    expect(
      screen.getByRole("heading", { level: 1, name: "Legal case tracker" }),
    ).toBeInTheDocument();
    expect(auth.protect).toHaveBeenCalledOnce();
  });
});

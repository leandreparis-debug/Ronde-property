import { describe, expect, it } from "vitest";

import { cn } from "@/lib/cn";

describe("cn", () => {
  it("joins class names and ignores falsy values", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });

  it("supports conditional objects and arrays", () => {
    expect(cn("base", { active: true, hidden: false }, ["x", ["y"]])).toBe("base active x y");
  });

  it("lets the last conflicting Tailwind utility win", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
    expect(cn("bg-brand", "bg-paper")).toBe("bg-paper");
  });
});

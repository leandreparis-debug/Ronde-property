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

describe("cn with RONDE tokens", () => {
  it("keeps a text colour next to a text size of the type scale", () => {
    expect(cn("text-on-brand", "text-body")).toBe("text-on-brand text-body");
    expect(cn("text-ui", "text-body")).toBe("text-body");
  });
});

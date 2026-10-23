import { describe, it, expect } from "vitest";
import { navigationItems } from "./navigation";
describe("operations navigation", () => {
  it("exposes every required workspace route", () =>
    expect(navigationItems.map((item) => item[1])).toEqual([
      "/",
      "/incidents",
      "/evidence",
      "/agents",
      "/simulation",
      "/analytics",
      "/settings",
    ]));
  it("keeps routes unique for direct navigation", () => {
    const paths = navigationItems.map((item) => item[1]);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

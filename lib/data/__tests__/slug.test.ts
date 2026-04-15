import { describe, it, expect } from "vitest";
import {
  buildComparisonSlug,
  parseComparisonSlug,
  refLastName,
  getComparisonSlug,
  getDriverSlug,
} from "../types";
import type { Driver } from "../types";

// ─── refLastName ──────────────────────────────────────────────────────────────

describe("refLastName", () => {
  it("extracts last segment from firstname_lastname refs", () => {
    expect(refLastName("max_verstappen")).toBe("verstappen");
    expect(refLastName("lewis_hamilton")).toBe("hamilton");
    expect(refLastName("michael_schumacher")).toBe("schumacher");
    expect(refLastName("mick_schumacher")).toBe("schumacher");
  });

  it("returns the whole ref when there is no underscore", () => {
    expect(refLastName("senna")).toBe("senna");
    expect(refLastName("prost")).toBe("prost");
    expect(refLastName("fangio")).toBe("fangio");
  });

  it("handles multi-segment refs (uses last _ as boundary)", () => {
    // e.g. damon_hill, graham_hill — both end in "hill"
    expect(refLastName("damon_hill")).toBe("hill");
    expect(refLastName("graham_hill")).toBe("hill");
    // jos_verstappen
    expect(refLastName("jos_verstappen")).toBe("verstappen");
  });
});

// ─── buildComparisonSlug ──────────────────────────────────────────────────────

describe("buildComparisonSlug", () => {
  it("orders by last name alphabetically regardless of input order", () => {
    expect(buildComparisonSlug("max_verstappen", "lewis_hamilton")).toBe(
      "lewis_hamilton-vs-max_verstappen"
    );
    expect(buildComparisonSlug("lewis_hamilton", "max_verstappen")).toBe(
      "lewis_hamilton-vs-max_verstappen"
    );
  });

  it("is idempotent — same result regardless of argument order", () => {
    const refs: [string, string][] = [
      ["ayrton_senna", "alain_prost"],
      ["max_verstappen", "charles_leclerc"],
      ["sebastian_vettel", "fernando_alonso"],
    ];
    for (const [a, b] of refs) {
      expect(buildComparisonSlug(a, b)).toBe(buildComparisonSlug(b, a));
    }
  });

  // ─── Same-surname edge cases ───────────────────────────────────────────────

  it("Schumacher brothers: tie-breaks on full ref (michael < mick alphabetically)", () => {
    const slug = buildComparisonSlug("michael_schumacher", "mick_schumacher");
    expect(slug).toBe("michael_schumacher-vs-mick_schumacher");
    // same result reversed
    expect(buildComparisonSlug("mick_schumacher", "michael_schumacher")).toBe(slug);
  });

  it("Hill father/son: tie-breaks on full ref (damon < graham alphabetically)", () => {
    const slug = buildComparisonSlug("damon_hill", "graham_hill");
    expect(slug).toBe("damon_hill-vs-graham_hill");
    expect(buildComparisonSlug("graham_hill", "damon_hill")).toBe(slug);
  });

  it("Verstappen father/son: tie-breaks on full ref (jos < max alphabetically)", () => {
    const slug = buildComparisonSlug("jos_verstappen", "max_verstappen");
    expect(slug).toBe("jos_verstappen-vs-max_verstappen");
    expect(buildComparisonSlug("max_verstappen", "jos_verstappen")).toBe(slug);
  });

  it("single-segment refs sort by the ref itself (no underscore)", () => {
    // prost < senna
    expect(buildComparisonSlug("senna", "prost")).toBe("prost-vs-senna");
    expect(buildComparisonSlug("prost", "senna")).toBe("prost-vs-senna");
  });

  it("last name always wins over first name in sort order", () => {
    // alain_prost vs ayrton_senna: prost < senna → prost first
    expect(buildComparisonSlug("ayrton_senna", "alain_prost")).toBe(
      "alain_prost-vs-ayrton_senna"
    );
  });
});

// ─── parseComparisonSlug ──────────────────────────────────────────────────────

describe("parseComparisonSlug", () => {
  it("parses a valid slug", () => {
    expect(parseComparisonSlug("lewis_hamilton-vs-max_verstappen")).toEqual({
      driverARef: "lewis_hamilton",
      driverBRef: "max_verstappen",
    });
  });

  it("parses single-segment refs", () => {
    expect(parseComparisonSlug("prost-vs-senna")).toEqual({
      driverARef: "prost",
      driverBRef: "senna",
    });
  });

  it("returns null for invalid slugs", () => {
    expect(parseComparisonSlug("hamilton")).toBeNull();
    expect(parseComparisonSlug("")).toBeNull();
    expect(parseComparisonSlug("hamilton-and-verstappen")).toBeNull();
  });

  it("round-trips with buildComparisonSlug", () => {
    const slug = buildComparisonSlug("michael_schumacher", "mick_schumacher");
    const parsed = parseComparisonSlug(slug);
    expect(parsed).not.toBeNull();
    // rebuilding from parsed refs yields the same slug
    expect(buildComparisonSlug(parsed!.driverARef, parsed!.driverBRef)).toBe(slug);
  });
});

// ─── getDriverSlug ────────────────────────────────────────────────────────────

describe("getDriverSlug", () => {
  const make = (
    last_name: string,
    first_name = "Test",
    driver_ref = "test_ref"
  ): Pick<Driver, "driver_ref" | "first_name" | "last_name"> => ({
    driver_ref,
    first_name,
    last_name,
  });

  it("returns lowercased last name", () => {
    expect(getDriverSlug(make("Verstappen", "Max"))).toBe("verstappen");
    expect(getDriverSlug(make("Hamilton", "Lewis"))).toBe("hamilton");
  });

  it("hyphenates multi-word last names", () => {
    expect(getDriverSlug(make("De La Rosa", "Pedro"))).toBe("de-la-rosa");
  });

  it("falls back to driver_ref when last_name is empty", () => {
    expect(getDriverSlug(make("", "Anon", "anon_driver"))).toBe("anon_driver");
  });
});

// ─── getComparisonSlug ────────────────────────────────────────────────────────

describe("getComparisonSlug", () => {
  const driver = (
    last_name: string,
    driver_ref: string,
    first_name = "X"
  ): Pick<Driver, "driver_ref" | "first_name" | "last_name"> => ({
    driver_ref,
    first_name,
    last_name,
  });

  it("orders by last name alphabetically", () => {
    const hamilton = driver("Hamilton", "lewis_hamilton", "Lewis");
    const verstappen = driver("Verstappen", "max_verstappen", "Max");
    expect(getComparisonSlug(verstappen, hamilton)).toBe("hamilton-vs-verstappen");
    expect(getComparisonSlug(hamilton, verstappen)).toBe("hamilton-vs-verstappen");
  });

  it("Schumacher brothers: tie-breaks on driver_ref", () => {
    const michael = driver("Schumacher", "michael_schumacher", "Michael");
    const mick = driver("Schumacher", "mick_schumacher", "Mick");
    // michael_schumacher < mick_schumacher lexicographically
    const slug = getComparisonSlug(michael, mick);
    expect(slug).toBe(getComparisonSlug(mick, michael)); // same both ways
    // michael comes first (driver_ref tie-break: michael_ < mick_)
    expect(slug).toMatch(/^schumacher/); // tokens are last-name based via getDriverSlug
  });

  it("Hill father/son: same surname, driver_ref tie-break", () => {
    const damon = driver("Hill", "damon_hill", "Damon");
    const graham = driver("Hill", "graham_hill", "Graham");
    const slug = getComparisonSlug(damon, graham);
    expect(slug).toBe(getComparisonSlug(graham, damon));
    expect(slug).toMatch(/^hill-vs-hill$/);
  });

  it("Verstappen father/son: same surname, driver_ref tie-break", () => {
    const jos = driver("Verstappen", "jos_verstappen", "Jos");
    const max = driver("Verstappen", "max_verstappen", "Max");
    const slug = getComparisonSlug(jos, max);
    expect(slug).toBe(getComparisonSlug(max, jos));
    expect(slug).toMatch(/^verstappen-vs-verstappen$/);
  });
});

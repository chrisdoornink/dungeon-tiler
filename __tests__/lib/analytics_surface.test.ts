import { surfaceForPath } from "../../lib/analytics_surface";

describe("surfaceForPath", () => {
  it("treats / and /daily-new as one daily surface", () => {
    // "/" re-exports the daily-new component and the floor transition pushes
    // /daily-new directly, so splitting them would split the daily's traffic.
    expect(surfaceForPath("/")).toBe("daily");
    expect(surfaceForPath("/daily-new")).toBe("daily");
  });

  it("labels the surfaces we want to watch for unintended traffic", () => {
    expect(surfaceForPath("/story")).toBe("story");
    expect(surfaceForPath("/stats")).toBe("stats");
    expect(surfaceForPath("/endless")).toBe("endless");
  });

  it("labels the rest of the real routes", () => {
    expect(surfaceForPath("/new")).toBe("new_player");
    expect(surfaceForPath("/end")).toBe("end");
    expect(surfaceForPath("/tutorial")).toBe("tutorial");
    expect(surfaceForPath("/privacy")).toBe("privacy");
  });

  it("collapses every dev harness into one 'test' surface", () => {
    expect(surfaceForPath("/test-elements")).toBe("test");
    expect(surfaceForPath("/test-shaper")).toBe("test");
    expect(surfaceForPath("/test-water-daily")).toBe("test");
    // Harnesses that do not exist yet must classify without a code change.
    expect(surfaceForPath("/test-some-future-thing")).toBe("test");
  });

  it("does not mistake a real route for a harness", () => {
    // Guards against a prefix match on "test" swallowing e.g. a /testimonials.
    expect(surfaceForPath("/testimonials")).toBe("other");
  });

  it("normalizes trailing slashes, query strings and hashes", () => {
    // skipTrailingSlashRedirect is on in next.config.ts, so "/story/" is a real
    // path that reaches the app and must not split into its own surface.
    expect(surfaceForPath("/story/")).toBe("story");
    expect(surfaceForPath("/test-lava-gen?seed=123&floor=2")).toBe("test");
    expect(surfaceForPath("/stats#top")).toBe("stats");
  });

  it("falls back to 'other' for unknown or missing paths", () => {
    expect(surfaceForPath("/nope")).toBe("other");
    expect(surfaceForPath("")).toBe("other");
    expect(surfaceForPath(undefined)).toBe("other");
    expect(surfaceForPath(null)).toBe("other");
  });
});

import fs from "fs";
import path from "path";
import { EnemyRegistry, getEnemyIcon, type EnemyKind, type Facing } from "../../lib/enemies/registry";

/**
 * Every sprite the registry names must actually be on disk.
 *
 * A wrong path here fails silently — the tile just renders nothing, or (worse) the browser
 * keeps serving a CACHED file that used to live at that path. That is exactly what happened
 * when the Fisher's hand-drawn art was dropped in using the same filenames as its earlier
 * placeholders: the code was correct, the files were correct, and the game still showed the
 * old art. Nothing in the suite noticed. This does.
 */
const PUBLIC_DIR = path.join(process.cwd(), "public");

/** Strip any asset-base prefix the standalone build adds, back to a repo-relative path. */
function toPublicPath(url: string): string {
  const idx = url.indexOf("/images/");
  return idx === -1 ? url : url.slice(idx);
}

const FACINGS: Facing[] = ["front", "left", "right", "back"];
const kinds = Object.keys(EnemyRegistry) as EnemyKind[];

describe("enemy sprite paths resolve to real files", () => {
  it.each(kinds)("%s: every declared asset exists", (kind) => {
    const assets = EnemyRegistry[kind].assets as Record<string, string | undefined>;
    const declared = Object.entries(assets).filter(([, v]) => typeof v === "string");
    expect(declared.length).toBeGreaterThan(0);
    for (const [facing, url] of declared) {
      const rel = toPublicPath(url as string);
      const file = path.join(PUBLIC_DIR, rel);
      expect(fs.existsSync(file)).toBe(true);
      // Guard against a zero-byte or truncated write.
      expect(fs.statSync(file).size).toBeGreaterThan(100);
      expect(`${kind}.${facing}`).toBeTruthy();
    }
  });

  it.each(kinds)("%s: getEnemyIcon returns a real file for every facing", (kind) => {
    for (const facing of FACINGS) {
      const url = getEnemyIcon(kind, facing);
      if (!url) continue; // some kinds legitimately have no art for a facing
      const file = path.join(PUBLIC_DIR, toPublicPath(url));
      expect(fs.existsSync(file)).toBe(true);
    }
  });
});

describe("the Fisher's pose sprites resolve", () => {
  // These are built by string interpolation in Tile.tsx (`fisher-${enemyPose}.png`) rather
  // than declared in the registry, so the check above cannot see them at all.
  const POSES = ["cocked", "pickup", "stalk"] as const;

  it.each(POSES)("fisher-%s.png exists", (pose) => {
    const file = path.join(
      PUBLIC_DIR,
      "images/enemies/bosses/fisher",
      `fisher-${pose}.png`
    );
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.statSync(file).size).toBeGreaterThan(100);
  });

  it("does not reuse a filename from the retired placeholder set", () => {
    // The placeholders were fisher-front/right/back/left/coiled/embedded/strike.png. Serving
    // real art from any of those paths means cached placeholder bytes win in the browser.
    const dir = path.join(PUBLIC_DIR, "images/enemies/bosses/fisher");
    const retired = [
      "fisher-front.png",
      "fisher-right.png",
      "fisher-left.png",
      "fisher-back.png",
      "fisher-coiled.png",
      "fisher-embedded.png",
      "fisher-strike.png",
    ];
    for (const name of retired) {
      expect(fs.existsSync(path.join(dir, name))).toBe(false);
    }
  });
});

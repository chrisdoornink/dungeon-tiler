/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { bossEmojiFor, bossNameFor } from "../../lib/bosses/boss_roster";
import type {
  EndgameStatsResponse,
  StatsDayPayload,
  GameCompleteRow,
} from "../../lib/stats/endgame_stats";

// Retro palette, borrowed from the in-game .pixel-* styles so the dashboard
// reads like part of the game rather than an admin panel.
const C = {
  bg: "#161225",
  panel: "#1f1d2d",
  panel2: "#2b2540",
  border: "#8b7fe0",
  borderDark: "#0d0b1a",
  text: "#f5f3ff",
  muted: "#a79fce",
  gold: "#f9d65c",
  win: "#7ce7a3",
  loss: "#ff8080",
  bomb: "#ff9f43",
};

const ICON = {
  closedChest: "/images/items/closed-chest.png",
  heart: "/images/items/heart.png",
  pinkHeart: "/images/items/pink-heart.png",
  sword: "/images/items/sword.png",
  shield: "/images/items/shield.png",
  medallion: "/images/items/snake-medalion.png",
  portal: "/images/items/portal-static.png",
  tree: "/images/trees/tree-1.png",
  bomb: "/images/items/bomb-black.png",
};

// Maps a recorded chest-item key (from analytics `collected_chest_items`) to its
// icon + label, so the loot row can show exactly what a run pulled from chests.
const LOOT_META: Record<string, { icon: string; label: string }> = {
  sword: { icon: ICON.sword, label: "Sword" },
  shield: { icon: ICON.shield, label: "Shield" },
  snake_medallion: { icon: ICON.medallion, label: "Snake Medallion" },
  extra_heart: { icon: ICON.heart, label: "Extra Heart" },
  bomb: { icon: ICON.bomb, label: "Bomb" },
  pink_heart: { icon: ICON.pinkHeart, label: "Pink Heart" },
};

// The four daily boss-entrance kinds (see boss_day.ts). Emoji only — no dedicated
// art yet — matching the ice+skull+fire boss identity used in the casualty list.
const BOSS_ENTRANCE_META: Record<string, { emoji: string; label: string }> = {
  bomb: { emoji: "🧨", label: "Bomb wall" },
  douse: { emoji: "🌑", label: "Douse portal" },
  "moat-lava": { emoji: "🌋", label: "Lava moat" },
  "moat-water": { emoji: "🌊", label: "Water moat" },
};

const DAYS_PER_PAGE = 3;

function PixelImg({
  src,
  alt,
  size = 20,
  dim = false,
  title,
}: {
  src: string;
  alt: string;
  size?: number;
  dim?: boolean;
  title?: string;
}) {
  return (
    <img
      src={src}
      alt={alt}
      title={title ?? alt}
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        imageRendering: "pixelated",
        opacity: dim ? 0.25 : 1,
        objectFit: "contain",
        flexShrink: 0,
      }}
    />
  );
}

function formatDay(dateStr: string): { weekday: string; rest: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return { weekday: "", rest: dateStr };
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
  const rest = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return { weekday, rest };
}

/** Small labelled stat chip used in the day-summary strip. */
function StatChip({
  icon,
  emoji,
  value,
  label,
  accent,
}: {
  icon?: string;
  emoji?: string;
  value: React.ReactNode;
  label: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        background: C.panel2,
        border: `2px solid ${C.borderDark}`,
        borderRadius: 4,
        padding: "4px 8px",
        minWidth: 0,
      }}
    >
      {icon ? <PixelImg src={icon} alt={label} size={18} /> : null}
      {emoji ? <span style={{ fontSize: 14 }}>{emoji}</span> : null}
      <span
        className="pixel-text"
        style={{ color: accent ?? C.text, fontSize: 12, lineHeight: 1 }}
      >
        {value}
      </span>
      <span style={{ color: C.muted, fontSize: 11, lineHeight: 1 }}>{label}</span>
    </div>
  );
}

type LootItem = { icon: string; label: string };

/**
 * Reconstruct the chest loot a run collected. We don't store per-item chest
 * contents, but we can infer them: the two Floor-1 chests are always sword +
 * shield (known via has_sword/has_shield), the two Floor-2 chests hold that
 * day's seed-derived items (l2Items), and chests_opened tells us the total.
 * So when someone opened everything, we can name every item; when they opened
 * only one of the two L2 chests we can't tell which, so it becomes a "?" pip.
 * Returns null when the run predates chest tracking (value genuinely unknown).
 */
function deriveLoot(
  g: GameCompleteRow,
  l2Items: LootItem[]
): { items: LootItem[]; mystery: number } | null {
  // Exact data (newer runs record the actual items collected). Preferred — it
  // even resolves the "opened only one L2 chest" case the inference can't.
  if (g.collectedChestItems && g.collectedChestItems.length > 0) {
    const items = g.collectedChestItems.map(
      (k) => LOOT_META[k] ?? { icon: ICON.closedChest, label: k }
    );
    return { items, mystery: 0 };
  }
  // Fall back to seed-based inference for runs recorded before that telemetry.
  if (g.chestsOpened == null) return null;
  const items: LootItem[] = [];
  if (g.hasSword) items.push({ icon: ICON.sword, label: "Sword" });
  if (g.hasShield) items.push({ icon: ICON.shield, label: "Shield" });
  const f2Opened = Math.max(0, Math.min(g.chestsOpened - items.length, l2Items.length));
  let mystery = 0;
  if (f2Opened >= l2Items.length) {
    l2Items.forEach((it) => items.push(it));
  } else {
    mystery = f2Opened; // opened some L2 chest(s) but which item is ambiguous
  }
  return { items, mystery };
}

function GameRow({ g, l2Items }: { g: GameCompleteRow; l2Items: LootItem[] }) {
  const win = g.outcome === "win";
  const loot = deriveLoot(g, l2Items);
  const emptyChest = loot != null && loot.items.length === 0 && loot.mystery === 0;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 10,
        padding: "8px 10px",
        background: C.panel,
        border: `2px solid ${C.borderDark}`,
        borderRadius: 4,
      }}
    >
      {/* outcome */}
      <div
        className="pixel-text"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: win ? C.win : C.loss,
          fontSize: 12,
          minWidth: 92,
        }}
      >
        <span style={{ fontSize: 15 }}>{win ? "🏆" : "💀"}</span>
        {win ? "ESCAPED" : "FELL"}
      </div>

      {/* floor reached */}
      <div
        className="pixel-text"
        style={{
          color: C.gold,
          fontSize: 12,
          background: C.borderDark,
          borderRadius: 3,
          padding: "2px 6px",
        }}
        title="Deepest floor reached"
      >
        {g.levelReached != null ? `F${g.levelReached}` : "F?"}
      </div>

      {/* health — only shown for escapes; a fall is always 0 so the icon is just noise */}
      {win ? (
        <div style={{ display: "flex", alignItems: "center", gap: 3 }} title="Health remaining">
          <PixelImg src={ICON.heart} alt="health" size={16} />
          <span style={{ color: C.text, fontSize: 13 }}>{g.heroHealth ?? 0}</span>
        </div>
      ) : null}

      {/* enemies defeated */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }} title="Enemies defeated">
        <span style={{ fontSize: 13 }}>⚔️</span>
        <span style={{ color: C.text, fontSize: 13 }}>{g.enemiesDefeated ?? 0}</span>
      </div>

      {/* steps */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }} title="Steps taken">
        <span style={{ fontSize: 13 }}>👣</span>
        <span style={{ color: C.text, fontSize: 13 }}>{g.steps ?? 0}</span>
      </div>

      {/* chest + collected loot (chest icon, then an icon per item they got) */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 4 }}
        title={
          loot == null
            ? "Chest loot not recorded for this run"
            : "Chest, then the items collected from chests"
        }
      >
        <PixelImg src={ICON.closedChest} alt="chest loot" size={16} dim={loot == null || emptyChest} />
        {loot == null ? (
          <span style={{ color: C.muted, fontSize: 13 }}>—</span>
        ) : emptyChest ? (
          <span style={{ color: C.muted, fontSize: 13 }}>0</span>
        ) : (
          <>
            {loot.items.map((it, i) => (
              <PixelImg key={`it-${i}`} src={it.icon} alt={it.label} size={16} />
            ))}
            {Array.from({ length: loot.mystery }).map((_, i) => (
              <span
                key={`myst-${i}`}
                title="Opened a Level 2 chest (item not recorded)"
                style={{
                  width: 16,
                  height: 16,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  color: C.muted,
                  border: `1px solid ${C.borderDark}`,
                  borderRadius: 3,
                }}
              >
                ?
              </span>
            ))}
          </>
        )}
      </div>

      {/* secret-progress flags: only lit when achieved */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
        {g.reachedPinkRealm ? (
          <PixelImg src={ICON.pinkHeart} alt="Reached pink realm" size={16} title="Reached the pink realm" />
        ) : null}
        {g.reachedOutsideWorld ? (
          <PixelImg src={ICON.portal} alt="Reached outside world" size={16} title="Reached the outside world" />
        ) : null}
        {g.treesDestroyed > 0 ? (
          <PixelImg src={ICON.tree} alt="Blew up a tree" size={16} title={`Blew up ${g.treesDestroyed} tree(s)`} />
        ) : null}
        {g.bossDefeated ? (
          <span
            title={`Slew ${bossNameFor(g.bossKind)} via ${g.bossEntranceKind ?? "unknown"} entrance`}
            style={{ fontSize: 14 }}
          >
            {bossEmojiFor(g.bossKind)}
          </span>
        ) : g.reachedBossRoom ? (
          <span
            title={`Found ${bossNameFor(g.bossKind)}, but didn't defeat it`}
            style={{ fontSize: 14, opacity: 0.5 }}
          >
            {bossEmojiFor(g.bossKind)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function DayCard({ day }: { day: StatsDayPayload }) {
  const { weekday, rest } = formatDay(day.date);
  const s = day.summary;
  return (
    <section
      style={{
        background: `linear-gradient(${C.panel}, ${C.bg})`,
        border: `3px solid ${C.border}`,
        boxShadow: `0 0 0 3px ${C.borderDark}`,
        borderRadius: 6,
        padding: 14,
        marginBottom: 22,
      }}
    >
      {/* header: date + chest status */}
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          borderBottom: `2px solid ${C.borderDark}`,
          paddingBottom: 10,
          marginBottom: 10,
        }}
      >
        <div>
          <div className="pixel-text" style={{ color: C.gold, fontSize: 16, lineHeight: 1.4 }}>
            {rest}
          </div>
          <div style={{ color: C.muted, fontSize: 12 }}>
            {weekday} · {s.total} game{s.total === 1 ? "" : "s"}
          </div>
        </div>

        {/* Level 2 chest status — same for everyone on this date */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: C.panel2,
            border: `2px solid ${C.borderDark}`,
            borderRadius: 5,
            padding: "6px 10px",
          }}
        >
          <span style={{ color: C.muted, fontSize: 11, maxWidth: 78, lineHeight: 1.2 }}>
            Level 2 chests
          </span>
          {day.chests.items.length > 0 ? (
            day.chests.items.map((it, i) => (
              <div
                key={`${it.key}-${i}`}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}
                title={it.label}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 34,
                    height: 34,
                    background: C.bg,
                    border: `2px solid ${it.key === "bomb" ? C.bomb : C.border}`,
                    borderRadius: 4,
                  }}
                >
                  <PixelImg src={it.icon} alt={it.label} size={24} />
                </div>
                <span style={{ color: C.muted, fontSize: 9 }}>{it.label}</span>
              </div>
            ))
          ) : (
            <span style={{ color: C.muted, fontSize: 11 }}>—</span>
          )}
          <span
            className="pixel-text"
            style={{
              fontSize: 10,
              padding: "3px 6px",
              borderRadius: 3,
              color: day.chests.bombAvailable ? C.borderDark : C.muted,
              background: day.chests.bombAvailable ? C.bomb : "transparent",
              border: `1px solid ${day.chests.bombAvailable ? C.bomb : C.borderDark}`,
            }}
            title="Whether a bomb was available in the Level 2 chests (gates outside world + pink realm)"
          >
            {day.chests.bombAvailable ? "BOMB DAY" : "NO BOMB"}
          </span>
          {day.bossDay.entranceKind ? (
            <span
              className="pixel-text"
              style={{
                fontSize: 10,
                padding: "3px 6px",
                borderRadius: 3,
                color: C.text,
                background: "transparent",
                border: `1px solid ${C.border}`,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
              title={`Today's boss room is reached via: ${
                BOSS_ENTRANCE_META[day.bossDay.entranceKind]?.label ?? day.bossDay.entranceKind
              } (computed from the date, independent of who played)`}
            >
              <span>{BOSS_ENTRANCE_META[day.bossDay.entranceKind]?.emoji ?? "❄️💀🔥"}</span>
              {(BOSS_ENTRANCE_META[day.bossDay.entranceKind]?.label ?? day.bossDay.entranceKind).toUpperCase()}
            </span>
          ) : null}
          {/* WHICH boss the day rolled, replayed from the date like the entrance beside it —
              so it's known even on a day nobody has reached floor 3 yet. */}
          {day.bossDay.bossKind ? (
            <span
              className="pixel-text"
              style={{
                fontSize: 10,
                padding: "3px 6px",
                borderRadius: 3,
                color: C.text,
                background: "transparent",
                border: `1px solid ${C.border}`,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
              title={`Today's boss is ${day.bossDay.bossName} (rolled from the date, the same for every player)`}
            >
              <span>{day.bossDay.bossEmoji}</span>
              {(day.bossDay.bossName ?? "").toUpperCase()}
            </span>
          ) : null}
        </div>
      </header>

      {/* objective summary strip */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <StatChip emoji="🏆" value={`${s.winRate}%`} label={`${s.wins}/${s.total} win`} accent={C.win} />
        <StatChip
          value={s.avgLevelReached != null ? `F${s.avgLevelReached}` : "—"}
          label="avg floor"
          accent={C.gold}
        />
        <StatChip icon={ICON.pinkHeart} value={s.reachedPinkRealm} label="pink realm" accent={C.text} />
        <StatChip icon={ICON.portal} value={s.reachedOutsideWorld} label="outside" accent={C.text} />
        <StatChip icon={ICON.tree} value={s.blewUpTree} label="tree" accent={C.text} />
        {day.bossDay.entranceKind ? (
          <>
            <StatChip
              emoji={day.bossDay.bossEmoji ?? bossEmojiFor(null)}
              value={s.reachedBossRoom}
              label="found boss"
              accent={C.text}
            />
            <StatChip
              emoji={day.bossDay.bossEmoji ?? bossEmojiFor(null)}
              value={s.bossDefeated}
              label="boss slain"
              accent={C.win}
            />
          </>
        ) : null}
      </div>

      {/* per-game rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {day.games.length === 0 ? (
          <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic" }}>
            No completed games recorded for this day.
          </div>
        ) : (
          day.games.map((g, i) => (
            <GameRow key={`${g.distinctId}-${g.timestamp}-${i}`} g={g} l2Items={day.chests.items} />
          ))
        )}
      </div>
    </section>
  );
}

export default function EndgameStats() {
  const [days, setDays] = useState<StatsDayPayload[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ days: String(DAYS_PER_PAGE) });
      if (cursor) params.set("beforeDay", cursor);
      const res = await fetch(`/api/endgame-stats?${params.toString()}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as EndgameStatsResponse;
      setConfigured(data.configured);
      if (data.message) setNotice(data.message);
      setDays((prev) => [...prev, ...data.days]);
      setCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load stats.");
      setHasMore(false);
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setInitialized(true);
    }
  }, [cursor, hasMore]);

  // Initial load.
  useEffect(() => {
    loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Infinite scroll: load the next page when the sentinel scrolls into view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "400px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: "24px 16px 80px" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <h1 className="pixel-text" style={{ color: C.gold, fontSize: 20, marginBottom: 22 }}>
          Endgame Stats
        </h1>

        {!configured && initialized ? (
          <div
            className="pixel-text"
            style={{
              background: C.panel,
              border: `3px solid ${C.bomb}`,
              boxShadow: `0 0 0 3px ${C.borderDark}`,
              borderRadius: 6,
              padding: 16,
              color: C.text,
              fontSize: 12,
              lineHeight: 1.7,
            }}
          >
            <div style={{ color: C.bomb, marginBottom: 8 }}>PostHog read access not configured</div>
            <div style={{ color: C.muted }}>
              {notice ??
                "Set POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID on the server to load stats."}
            </div>
            <ul style={{ color: C.muted, marginTop: 10, paddingLeft: 18, listStyle: "square" }}>
              <li>POSTHOG_PERSONAL_API_KEY — a personal API key (Settings → Personal API keys)</li>
              <li>POSTHOG_PROJECT_ID — numeric project id (Project settings)</li>
              <li>POSTHOG_HOST — optional, defaults to https://us.posthog.com</li>
            </ul>
          </div>
        ) : null}

        {configured &&
          days.map((day, i) => <DayCard key={`${day.date}-${i}`} day={day} />)}

        {configured && initialized && days.length === 0 && !error ? (
          <div style={{ color: C.muted, fontSize: 13, fontStyle: "italic" }}>
            No completed daily runs found in PostHog yet.
          </div>
        ) : null}

        {error ? (
          <div
            style={{
              color: C.loss,
              fontSize: 13,
              border: `2px solid ${C.loss}`,
              borderRadius: 4,
              padding: 12,
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="pixel-text" style={{ color: C.muted, fontSize: 12, padding: "12px 0" }}>
            Loading…
          </div>
        ) : null}

        {configured && hasMore && !loading ? (
          <button
            onClick={loadMore}
            className="pixel-text"
            style={{
              background: C.panel2,
              color: C.text,
              border: `2px solid ${C.border}`,
              boxShadow: `0 0 0 2px ${C.borderDark}`,
              borderRadius: 4,
              padding: "10px 16px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Load more days
          </button>
        ) : null}

        {/* infinite-scroll sentinel */}
        <div ref={sentinelRef} style={{ height: 1 }} aria-hidden />

        {configured && !hasMore && initialized && days.length > 0 ? (
          <div style={{ color: C.muted, fontSize: 12, textAlign: "center", marginTop: 16 }}>
            — end of history —
          </div>
        ) : null}
      </div>
    </div>
  );
}

#!/usr/bin/env python3
"""
Generate the SPIKE_HOLES tile from the SPIKES tile, so the sockets land exactly where the
spikes stood.

Reads the base64 PNG embedded in `.spikes` in components/Tile.module.css, and writes a new
base64 PNG into `.spikeHoles` in the same file.

Method:
  1. Mask the spikes by SATURATION. The bed's palette splits cleanly: the iron is desaturated
     grey (sat < 0.18) and the pit is brown earth (sat > 0.35). No hand-tuned coordinates.
  2. Erase the iron, filling each erased pixel with the pit-interior colour.
  3. Find every spike FOOT: an iron pixel with bare ground directly below it. That is
     literally "where a spike met the floor", and unlike a per-column lowest-pixel profile it
     also catches the back-row spikes, whose feet sit higher up the tile but share columns
     with the front row (the profile version put every socket in the bottom two rows and left
     the upper half of the tile bare). Feet are then clustered by proximity, one socket each.
  4. Draw each socket as a dark ellipse with a lit rim along its top edge, matching the
     lighting convention of the spike tile (lit from top/left).
"""
import base64, io, re, pathlib, sys
from PIL import Image

CSS = pathlib.Path(__file__).resolve().parents[1] / "components" / "Tile.module.css"
if len(sys.argv) > 1:
    CSS = pathlib.Path(sys.argv[1])

# The ground the spikes vacated: the pit's own interior colour, so the erased iron leaves NO
# trace. A lighter fill was tried to give the near-black sockets something to contrast
# against, and it backfired badly — every erased spike showed through as a pale silhouette,
# so the tile read as a stain rather than as clean ground. Contrast comes from the socket
# collars instead, which are far brighter than anything else in the tile.
PIT_FILL = (33, 26, 20)
SOCKET_DARK = (6, 5, 4)      # the void
SOCKET_SHADE = (26, 20, 14)  # the far inside wall, catching a little light
# A full collar around each socket, brighter on the lit (upper-left) arc.
#
# These are FAR brighter than the pit they sit in, and that is the point. In game these tiles
# are dimmed by the field-of-view filter to 55-80% brightness, so anything subtle at full
# brightness is simply gone at the brightness the player sees it — the first pass used a
# collar around (96,79,56) and read as a flat black rectangle on screen. Judge this art
# DIMMED, not at 100%.
# Dulled deliberately. The first version that was actually visible was also the first one that
# looked wrong — a bright warm tan that read as yellow jewellery sitting on the floor. These
# are still ~4x the pit's luminance at the dimmest FOV tier, which is all the contrast the
# rings need, but they now read as lit stone rather than as gold.
SOCKET_RIM_LIT = (128, 112, 88)
SOCKET_RIM_DIM = (82, 70, 54)


def sat(c):
    return (max(c) - min(c)) / max(1, max(c))


def main():
    css = CSS.read_text()
    m = re.search(r"\.spikes \{.*?base64,([A-Za-z0-9+/=]+)", css, flags=re.S)
    if not m:
        raise SystemExit("could not find the .spikes base64 in " + str(CSS))
    im = Image.open(io.BytesIO(base64.b64decode(m.group(1)))).convert("RGB")
    w, h = im.size
    src = im.load()

    metal = {(x, y) for y in range(h) for x in range(w) if sat(src[x, y]) < 0.18}

    # A foot is iron sitting directly on ground.
    feet = sorted(
        (x, y) for (x, y) in metal
        if (x, y + 1) not in metal and y + 1 < h
    )

    # Cluster feet that touch or nearly touch into one socket per spike.
    GAP = 2.2
    clusters = []
    for fx, fy in feet:
        for c in clusters:
            if any(abs(fx - px) <= GAP and abs(fy - py) <= GAP for px, py in c):
                c.append((fx, fy))
                break
        else:
            clusters.append([(fx, fy)])
    # Merge clusters that ended up adjacent (single-pass clustering can split a wide foot).
    merged = True
    while merged:
        merged = False
        for i in range(len(clusters)):
            for j in range(i + 1, len(clusters)):
                if any(
                    abs(ax - bx) <= GAP and abs(ay - by) <= GAP
                    for ax, ay in clusters[i] for bx, by in clusters[j]
                ):
                    clusters[i].extend(clusters[j])
                    del clusters[j]
                    merged = True
                    break
            if merged:
                break

    sockets = []
    for c in clusters:
        if len(c) < 2:
            continue  # a single stray pixel is shading, not a foot
        cx = sum(x for x, _ in c) / len(c)
        cy = max(y for _, y in c)
        sockets.append((cx, cy, len(c)))

    out = im.copy()
    dst = out.load()
    for x, y in metal:
        dst[x, y] = PIT_FILL

    # Merge sockets that sit on top of each other. At 32px, nine sockets of any useful size
    # cannot all be distinct, and overlapping ones used to destroy each other's collars.
    # Separation is measured with x weighted DOWN, because the ovals are wide and flat: two
    # sockets side by side collide long before two stacked ones do.
    MIN_SEP = 3.4
    kept = []
    for cx, cy, wd in sorted(sockets, key=lambda t: -t[2]):  # widest foot wins its spot
        if all(
            ((cx - kx) / 1.6) ** 2 + (cy - ky) ** 2 >= (MIN_SEP / 1.6) ** 2
            for kx, ky, _ in kept
        ):
            kept.append((cx, cy, wd))
    sockets = kept

    # SQUASHED, not round. The camera looks at the floor from a shallow angle, so a circular
    # socket presents as a horizontally-stretched oval — near enough 2:1. Drawing them round
    # made them read as beads sitting on top of the ground rather than holes in it.
    # TWO PASSES, and this is the crux. Painting each socket completely before starting the
    # next let a later socket's dark interior overwrite an earlier one's bright collar, so the
    # tile ended up with 20 stray bright pixels instead of rings — invisible in game. Interiors
    # go down first; collars go on top and always win, so every ring stays unbroken.
    RX, RY = 2.6, 1.3

    def ellipse(cx, cy, scale):
        for y in range(h):
            for x in range(w):
                nx, ny = (x - cx) / (RX * scale), (y - cy) / (RY * scale)
                d = nx * nx + ny * ny
                if d <= 1.0:
                    yield x, y, nx, ny

    for cx, cy, _wd in sockets:
        for x, y, _nx, ny in ellipse(cx, cy, 1.0):
            dst[x, y] = SOCKET_DARK if ny > -0.35 else SOCKET_SHADE

    for cx, cy, _wd in sockets:
        inner = {(x, y) for x, y, _, _ in ellipse(cx, cy, 1.0)}
        for x, y, nx, ny in ellipse(cx, cy, 1.42):
            if (x, y) in inner:
                continue
            dst[x, y] = SOCKET_RIM_LIT if (ny + nx) < 0 else SOCKET_RIM_DIM

    buf = io.BytesIO()
    out.save(buf, format="PNG", optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode()
    for cx, cy, wd in sockets:
        print(f"  socket x={cx:5.1f} y={cy:2d} width={wd}")
    print(f"{len(sockets)} sockets; png {len(buf.getvalue())} bytes")
    print("BASE64:" + b64)


if __name__ == "__main__":
    main()

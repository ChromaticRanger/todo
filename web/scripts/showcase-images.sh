#!/usr/bin/env bash
#
# Derive the landing-page showcase images (public/showcase/) from the app
# screenshots in public/help-images/ and public/blog-images/.
#
# These are MARKETING assets — they are the first thing a visitor sees of the
# actual product, so they are worth regenerating whenever the UI moves. Note
# that `npm run help:shots` refreshes the source PNGs but NOT these WebP
# derivatives; run this afterwards.
#
#   npm run help:shots      # re-capture the PNGs (needs the dev server up)
#   npm run showcase:images # re-derive these
#
# Every slide is normalised to exactly 16:10 so the carousel frame never
# changes shape between slides. Two widths are emitted per slide; the rendered
# width is at most ~1104 CSS px (max-w-6xl minus gutters), so 1200w covers 1x
# and 2000w covers 2x.
#
# Requires ImageMagick 7 (`magick`) built with WebP support.

set -euo pipefail

cd "$(dirname "$0")/.."

OUT=public/showcase
mkdir -p "$OUT"

QUALITY=82

# emit <source-png> <slug> [crop-geometry]
emit() {
  local src=$1 slug=$2 crop=${3:-}
  local args=()
  [[ -n $crop ]] && args+=(-crop "$crop" +repage)

  magick "$src" "${args[@]}" -resize '1200x750!' -quality "$QUALITY" "$OUT/$slug-1200.webp"
  magick "$src" "${args[@]}" -resize '2000x1250!' -quality "$QUALITY" "$OUT/$slug-2000.webp"
  echo "  $slug"
}

echo "Deriving showcase images into $OUT/"

# Already 16:10 (2560x1600) — straight resize.
emit public/help-images/app-overview.png one-list
emit public/help-images/calendar.png     calendar
emit public/help-images/discover.png     discover
emit public/help-images/bookmarks.png    bookmarks

# Kanban comes from the demo session like everything else, now that the demo
# seeds a "Side project" list built for the purpose — four even columns rather
# than the two-category Travel list, whose board was indistinguishable from its
# grid. Previously this pulled from public/blog-images/views-kanban.png, which
# was denser but came from a real account in a different theme, so the carousel
# had one amber slide among three purple ones.
emit public/help-images/kanban.png kanban

echo
magick identify "$OUT"/*.webp | awk '{printf "  %-46s %s\n", $1, $3}'
echo
echo "Total: $(du -sh "$OUT" | cut -f1)"

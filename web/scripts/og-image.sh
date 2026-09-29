#!/usr/bin/env bash
#
# Generate the Open Graph / Twitter card image at public/og-image.png.
#
# This is what Slack, X, LinkedIn, WhatsApp, Discord and iMessage show when
# somebody pastes a stash-squirrel.com link. Those scrapers do not execute
# JavaScript, so it is the only picture of the product most people will see
# before deciding whether to click.
#
# 1200x630 is the size every platform crops from. Keep the important content
# inside the middle ~1000x500: Slack and Discord letterbox the edges.
#
# JPEG rather than PNG: the background is a smooth gradient, which PNG stores
# badly. 75 KB against 785 KB, with no visible difference at any size a
# scraper renders.
#
#   npm run og:image
#
# Requires ImageMagick 7 (`magick`) and the Fraunces font, which the site also
# loads from Google Fonts.

set -euo pipefail
cd "$(dirname "$0")/.."

OUT=public/og-image.jpg
LOGO=public/stash-squirrel.svg

# Matches the landing page hero gradient (LandingPage.vue).
RED=#e53b30
DEEP=#8b2a1f
INK=#1c1917
MUTED=#57534e
PAPER=#fdfbf8

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# The mascot renders from SVG at 2x then scales down, which keeps the edges
# clean — rasterising straight to the final size gives noticeably worse AA.
magick -background none -density 600 "$LOGO" -resize 760x760 "$tmp/logo.png"

# Warm paper background with a soft brand glow behind where the mascot sits,
# echoing the radial wash on the landing hero.
magick -size 1200x630 "xc:$PAPER" \
  \( -size 1200x630 radial-gradient:"$RED"-none -resize 1200x630\! \
     -alpha set -channel A -evaluate multiply 0.16 +channel \
     -roll +300+0 \) \
  -compose over -composite \
  "$tmp/bg.png"

magick "$tmp/bg.png" \
  \( "$tmp/logo.png" -resize 300x300 \) -gravity west -geometry +95+0 -composite \
  -font Fraunces-144pt-SemiBold-Italic -fill "$INK" -pointsize 92 \
  -gravity northwest -annotate +440+210 'Stash Squirrel' \
  -font Fraunces-144pt-Medium -fill "$MUTED" -pointsize 38 \
  -gravity northwest -annotate +446+330 'Todos, bookmarks and notes —' \
  -gravity northwest -annotate +446+382 'together in one list.' \
  -font Fraunces-144pt-Medium -fill "$DEEP" -pointsize 30 \
  -gravity northwest -annotate +446+450 'stash-squirrel.com' \
  -strip -quality 90 "$OUT"

magick identify "$OUT" | awk '{printf "  %s  %s  %.0f KB\n", $1, $3, $7/1024}'

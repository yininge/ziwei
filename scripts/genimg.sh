#!/usr/bin/env bash
# 用 Gemini Nano Banana 生一張圖。
#   scripts/genimg.sh out.jpg "prompt" [aspect_ratio] [--cutout] [--ref ref.jpg]
# --cutout：prompt 應要求洋紅 (#FF00FF) 純色背景，產出會另存去背 PNG（out.png）。
# --ref：把參考圖一起送進去（編輯／延續畫風用）。
# key 從 macOS 鑰匙圈 GEMINI_API_KEY 讀，不落地。
set -euo pipefail
out="$1"; prompt="$2"; ar="${3:-3:2}"; shift 3 || shift $#
cutout=""; ref=""
while [ $# -gt 0 ]; do case "$1" in --cutout) cutout=1;; --ref) ref="$2"; shift;; esac; shift; done
key="$(security find-generic-password -s GEMINI_API_KEY -w)"
refjson="[]"
[ -n "$ref" ] && refjson="$(jq -n --arg d "$(base64 < "$ref")" --arg m "image/$([ "${ref##*.}" = png ] && echo png || echo jpeg)" '[{type:"image",mime_type:$m,data:$d}]')"
body="$(jq -n --arg p "$prompt" --arg ar "$ar" --argjson ref "$refjson" '{
  model:"gemini-nano-banana-2.1",
  input:($ref + [{type:"text",text:$p}]),
  response_format:{type:"image",mime_type:"image/jpeg",aspect_ratio:$ar,image_size:"1K"}
}')"
resp="$(mktemp)"
curl -sS -X POST "https://generativelanguage.googleapis.com/v1beta/interactions" \
  -H "x-goog-api-key: $key" -H "Content-Type: application/json" -H "Api-Revision: 2026-05-20" \
  -d "$body" -o "$resp"
b64="$(jq -r '[.. | objects | select(.type=="image" and .data) | .data][0] // empty' "$resp")"
if [ -z "$b64" ]; then echo "no image in response:" >&2; jq -c 'del(.. | .data?)' "$resp" | head -c 800 >&2; echo >&2; exit 1; fi
printf '%s' "$b64" | base64 -d > "$out"
rm -f "$resp"
echo "wrote $out"
if [ -n "$cutout" ]; then
  png="${out%.*}.png"
  magick "$out" -fuzz 30% -transparent '#FF00FF' -channel A -morphology Erode Disk:2 +channel "$png"
  echo "wrote $png"
fi

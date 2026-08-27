#!/usr/bin/env bash
set -e

echo "[PWA] Generating high-quality PNG icons for Codesyne..."

generate_icon() {
  local size=$1
  local filename=$2
  local is_maskable=$3
  local point_size=$((size * 4 / 10))

  if [ "$is_maskable" = "true" ]; then
    # Maskable icon needs padding around the logo
    convert -size ${size}x${size} xc:"#040409" \
      -fill "#06b6d4" -font "Liberation-Sans-Bold" -pointsize $point_size \
      -gravity center -draw "text 0,0 '</>'" \
      PNG32:"$filename"
  else
    # Standard icon
    convert -size ${size}x${size} xc:"#080711" \
      -fill "#120f26" -draw "roundrectangle 0,0 ${size},${size} $((size / 8)),$((size / 8))" \
      -fill "#06b6d4" -font "Liberation-Sans-Bold" -pointsize $point_size \
      -gravity center -draw "text 0,0 '</>'" \
      PNG32:"$filename"
  fi
  echo "Generated $filename (${size}x${size} PNG)"
}

DIRS=("frontend/public" "public")

for dir in "${DIRS[@]}"; do
  mkdir -p "$dir"
  generate_icon 72 "$dir/icon-72.png" false
  generate_icon 96 "$dir/icon-96.png" false
  generate_icon 128 "$dir/icon-128.png" false
  generate_icon 144 "$dir/icon-144.png" false
  generate_icon 152 "$dir/icon-152.png" false
  generate_icon 192 "$dir/icon-192.png" false
  generate_icon 384 "$dir/icon-384.png" false
  generate_icon 512 "$dir/icon-512.png" false
  generate_icon 192 "$dir/icon-maskable-192.png" true
  generate_icon 512 "$dir/icon-maskable-512.png" true
  generate_icon 180 "$dir/apple-touch-icon.png" false
  convert "$dir/icon-192.png" -resize 32x32 "$dir/favicon.ico"
done

echo "[PWA] All icons generated successfully!"

#!/bin/bash
# Export a photo from Photos library to a viewable format
# Usage: photos-export.sh <uuid> [output_path]
# Default output: /tmp/photo_export.jpg
# Automatically converts HEIC to JPEG
# Works with both local and shared album photos, including cloud-only files

UUID="$1"
OUTPUT="${2:-/tmp/photo_export.jpg}"
OUTPUT="${OUTPUT/#\~/$HOME}"

if [ -z "$UUID" ]; then
    echo "Usage: photos-export.sh <uuid> [output_path]" >&2
    exit 1
fi

PHOTOS_LIB=~/Pictures/Photos\ Library.photoslibrary
PHOTOS_DB="$PHOTOS_LIB/database/Photos.sqlite"

if [ ! -f "$PHOTOS_DB" ]; then
    echo "Error: Photos database not found" >&2
    exit 1
fi

# Get filename, directory, and whether it's a shared album photo
read -r FILENAME DIRECTORY IS_SHARED < <(sqlite3 "$PHOTOS_DB" "
SELECT ZFILENAME, ZDIRECTORY,
    CASE WHEN ZCOLLECTIONSHARE IS NOT NULL THEN 1 ELSE 0 END
FROM ZASSET
WHERE ZUUID = '$UUID'
    AND ZTRASHEDSTATE = 0
LIMIT 1;
" 2>/dev/null | tr '|' ' ')

if [ -z "$FILENAME" ]; then
    echo "Error: Photo with UUID '$UUID' not found" >&2
    exit 1
fi

# Locate the original file
ORIGINAL=""
APPLESCRIPT_TMPDIR=""
if [ "$IS_SHARED" = "1" ]; then
    # Shared album: check cloudsharing data first (full original)
    CANDIDATE="$PHOTOS_LIB/scopes/cloudsharing/data/$DIRECTORY/$FILENAME"
    if [ -f "$CANDIDATE" ]; then
        ORIGINAL="$CANDIDATE"
        echo "Note: source=shared-album-local ($FILENAME)" >&2
    fi
else
    # Regular photo: check originals directory
    CANDIDATE="$PHOTOS_LIB/originals/$DIRECTORY/$FILENAME"
    if [ -f "$CANDIDATE" ]; then
        ORIGINAL="$CANDIDATE"
        echo "Note: source=originals-local ($FILENAME)" >&2
    fi
fi

# Fallback: search originals broadly (handles edge cases)
if [ -z "$ORIGINAL" ]; then
    CANDIDATE=$(find "$PHOTOS_LIB/originals" -name "$FILENAME" 2>/dev/null | head -1)
    if [ -n "$CANDIDATE" ] && [ -f "$CANDIDATE" ]; then
        ORIGINAL="$CANDIDATE"
        echo "Note: source=originals-broad-search ($FILENAME)" >&2
    fi
fi

# Fallback: use Photos.app to export (triggers iCloud download if needed)
if [ -z "$ORIGINAL" ]; then
    APPLESCRIPT_TMPDIR=$(mktemp -d)
    osascript << APPLESCRIPT 2>/dev/null
tell application "Photos"
    set theItem to media item id "$UUID"
    set exportFolder to POSIX file "$APPLESCRIPT_TMPDIR" as alias
    export {theItem} to exportFolder
end tell
APPLESCRIPT
    APPLESCRIPT_FILE=$(find "$APPLESCRIPT_TMPDIR" -type f | head -1)
    if [ -n "$APPLESCRIPT_FILE" ] && [ -f "$APPLESCRIPT_FILE" ]; then
        ORIGINAL="$APPLESCRIPT_FILE"
        echo "Note: source=photos-app-icloud-export ($FILENAME)" >&2
    fi
fi

# Last resort: use derivative thumbnail (low quality)
if [ -z "$ORIGINAL" ]; then
    FIRST_CHAR="${UUID:0:1}"
    CANDIDATE="$PHOTOS_LIB/scopes/cloudsharing/resources/derivatives/masters/$FIRST_CHAR/${UUID}_4_5005_c.jpeg"
    if [ -f "$CANDIDATE" ]; then
        ORIGINAL="$CANDIDATE"
        echo "Note: source=derivative-thumbnail-fallback (low quality, original not available locally or via iCloud)" >&2
    fi
fi

if [ -z "$ORIGINAL" ] || [ ! -f "$ORIGINAL" ]; then
    echo "Error: Photo file not available locally for $FILENAME" >&2
    echo "The original may not be downloaded from iCloud" >&2
    exit 1
fi

# Get file extension
EXT="${ORIGINAL##*.}"
EXT_LOWER=$(echo "$EXT" | tr '[:upper:]' '[:lower:]')

# Ensure output directory exists
mkdir -p "$(dirname "$OUTPUT")"

# Check if ImageMagick is available for proper orientation handling
HAS_MAGICK=false
if command -v magick >/dev/null 2>&1; then
    HAS_MAGICK=true
elif command -v convert >/dev/null 2>&1; then
    HAS_MAGICK=true
fi

# Convert HEIC/HEIF to JPEG, copy others directly
if [[ "$EXT_LOWER" == "heic" || "$EXT_LOWER" == "heif" ]]; then
    if [ "$HAS_MAGICK" = true ]; then
        magick "$ORIGINAL" -auto-orient "$OUTPUT" 2>/dev/null || \
        convert "$ORIGINAL" -auto-orient "$OUTPUT" 2>/dev/null
    else
        sips -s format jpeg "$ORIGINAL" --out "$OUTPUT" >/dev/null 2>&1
    fi
    if [ $? -ne 0 ]; then
        echo "Error: Failed to convert HEIC to JPEG" >&2
        exit 1
    fi
elif [[ "$EXT_LOWER" == "png" || "$EXT_LOWER" == "jpg" || "$EXT_LOWER" == "jpeg" ]]; then
    if [ "$HAS_MAGICK" = true ]; then
        magick "$ORIGINAL" -auto-orient "$OUTPUT" 2>/dev/null || \
        convert "$ORIGINAL" -auto-orient "$OUTPUT" 2>/dev/null
    else
        cp "$ORIGINAL" "$OUTPUT"
    fi
else
    cp "$ORIGINAL" "$OUTPUT"
fi

# Clean up Photos.app temp export dir if used
if [ -n "$APPLESCRIPT_TMPDIR" ]; then
    rm -rf "$APPLESCRIPT_TMPDIR"
fi

echo "$OUTPUT"

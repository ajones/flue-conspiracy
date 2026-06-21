#!/bin/bash
# Get a random photo from an album (regular or shared)
# Usage: photos-album-random.sh <album_name>
# Output: Filename | Date | Type | UUID

ALBUM="$1"

if [ -z "$ALBUM" ]; then
    echo "Usage: photos-album-random.sh <album_name>" >&2
    exit 1
fi

PHOTOS_DB=~/Pictures/Photos\ Library.photoslibrary/database/Photos.sqlite

if [ ! -f "$PHOTOS_DB" ]; then
    echo "Error: Photos database not found" >&2
    exit 1
fi

# Try shared album first, then regular album
RESULT=$(sqlite3 "$PHOTOS_DB" "
SELECT
    a.ZFILENAME,
    datetime(a.ZDATECREATED + 978307200, 'unixepoch', 'localtime'),
    CASE a.ZUNIFORMTYPEIDENTIFIER
        WHEN 'public.heic' THEN 'HEIC'
        WHEN 'public.jpeg' THEN 'JPEG'
        WHEN 'public.png' THEN 'PNG'
        WHEN 'com.apple.quicktime-movie' THEN 'VIDEO'
        ELSE a.ZUNIFORMTYPEIDENTIFIER
    END,
    a.ZUUID
FROM ZASSET a
WHERE a.ZCOLLECTIONSHARE = (
    SELECT Z_PK FROM ZSHARE WHERE ZTITLE LIKE '%$ALBUM%' AND ZTRASHEDSTATE = 0 LIMIT 1
)
AND a.ZTRASHEDSTATE = 0
AND a.ZFILENAME IS NOT NULL
ORDER BY RANDOM()
LIMIT 1;
" 2>/dev/null)

# If no shared album match, try regular album
if [ -z "$RESULT" ]; then
    RESULT=$(sqlite3 "$PHOTOS_DB" "
SELECT
    a.ZFILENAME,
    datetime(a.ZDATECREATED + 978307200, 'unixepoch', 'localtime'),
    CASE a.ZUNIFORMTYPEIDENTIFIER
        WHEN 'public.heic' THEN 'HEIC'
        WHEN 'public.jpeg' THEN 'JPEG'
        WHEN 'public.png' THEN 'PNG'
        WHEN 'com.apple.quicktime-movie' THEN 'VIDEO'
        ELSE a.ZUNIFORMTYPEIDENTIFIER
    END,
    a.ZUUID
FROM ZASSET a
JOIN Z_33ASSETS j ON j.Z_3ASSETS = a.Z_PK
JOIN ZGENERICALBUM g ON g.Z_PK = j.Z_33ALBUMS
WHERE g.ZTITLE LIKE '%$ALBUM%'
  AND g.ZTRASHEDSTATE = 0
  AND a.ZTRASHEDSTATE = 0
  AND a.ZFILENAME IS NOT NULL
ORDER BY RANDOM()
LIMIT 1;
" 2>/dev/null)
fi

if [ -z "$RESULT" ]; then
    echo "Error: No photos found in album matching '$ALBUM'" >&2
    exit 1
fi

echo "$RESULT" | while IFS='|' read -r filename date type uuid; do
    echo "$filename | $date | $type | $uuid"
done

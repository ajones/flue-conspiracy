#!/bin/bash
# Get the most recent photo from an album (regular or shared)
# Usage: photos-album-most-recent.sh <album_name>
# Output: Filename | Date | Type | UUID | Comment (only when present)

ALBUM="$1"

if [ -z "$ALBUM" ]; then
    echo "Usage: photos-album-most-recent.sh <album_name>" >&2
    exit 1
fi

PHOTOS_DB=~/Pictures/Photos\ Library.photoslibrary/database/Photos.sqlite

if [ ! -f "$PHOTOS_DB" ]; then
    echo "Error: Photos database not found" >&2
    exit 1
fi

# Try shared album first, then regular album
RESULT=$(sqlite3 -separator '|' "$PHOTOS_DB" "
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
    a.ZUUID,
    COALESCE(c.ZCOMMENTTEXT, ad.ZLONGDESCRIPTION, '')
FROM ZASSET a
LEFT JOIN ZCLOUDSHAREDCOMMENT c ON c.ZCOMMENTEDASSET = a.Z_PK AND c.ZISCAPTION = 1
LEFT JOIN ZADDITIONALASSETATTRIBUTES aaa ON aaa.ZASSET = a.Z_PK
LEFT JOIN ZASSETDESCRIPTION ad ON ad.ZASSETATTRIBUTES = aaa.ZASSETDESCRIPTION
WHERE a.ZCOLLECTIONSHARE = (
    SELECT Z_PK FROM ZSHARE WHERE ZTITLE LIKE '%$ALBUM%' AND ZTRASHEDSTATE = 0 LIMIT 1
)
AND a.ZTRASHEDSTATE = 0
AND a.ZFILENAME IS NOT NULL
ORDER BY a.ZDATECREATED DESC, c.ZCOMMENTDATE DESC
LIMIT 1;
" 2>/dev/null)

# If no shared album match, try regular album
if [ -z "$RESULT" ]; then
    RESULT=$(sqlite3 -separator '|' "$PHOTOS_DB" "
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
    a.ZUUID,
    COALESCE(c.ZCOMMENTTEXT, ad.ZLONGDESCRIPTION, '')
FROM ZASSET a
JOIN Z_33ASSETS j ON j.Z_3ASSETS = a.Z_PK
JOIN ZGENERICALBUM g ON g.Z_PK = j.Z_33ALBUMS
LEFT JOIN ZCLOUDSHAREDCOMMENT c ON c.ZCOMMENTEDASSET = a.Z_PK AND c.ZISCAPTION = 1
LEFT JOIN ZADDITIONALASSETATTRIBUTES aaa ON aaa.ZASSET = a.Z_PK
LEFT JOIN ZASSETDESCRIPTION ad ON ad.ZASSETATTRIBUTES = aaa.ZASSETDESCRIPTION
WHERE g.ZTITLE LIKE '%$ALBUM%'
  AND g.ZTRASHEDSTATE = 0
  AND a.ZTRASHEDSTATE = 0
  AND a.ZFILENAME IS NOT NULL
ORDER BY a.ZDATECREATED DESC, c.ZCOMMENTDATE DESC
LIMIT 1;
" 2>/dev/null)
fi

if [ -z "$RESULT" ]; then
    echo "Error: No photos found in album matching '$ALBUM'" >&2
    exit 1
fi

echo "$RESULT" | while IFS='|' read -r filename date type uuid comment; do
    if [ -n "$comment" ]; then
        echo "$filename | $date | $type | $uuid | $comment"
    else
        echo "$filename | $date | $type | $uuid"
    fi
done

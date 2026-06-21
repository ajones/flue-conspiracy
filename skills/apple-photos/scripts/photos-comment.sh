#!/bin/bash
# Get the comment/caption for a photo, if present
# Usage: photos-comment.sh <uuid>
# Output: comment text only (or empty if none)

UUID="$1"

if [ -z "$UUID" ]; then
    echo "Usage: photos-comment.sh <uuid>" >&2
    exit 1
fi

PHOTOS_DB=~/Pictures/Photos\ Library.photoslibrary/database/Photos.sqlite

if [ ! -f "$PHOTOS_DB" ]; then
    echo "Error: Photos database not found" >&2
    exit 1
fi

sqlite3 -noheader "$PHOTOS_DB" "
SELECT COALESCE(c.ZCOMMENTTEXT, ad.ZLONGDESCRIPTION, '')
FROM ZASSET a
LEFT JOIN ZCLOUDSHAREDCOMMENT c ON c.ZCOMMENTEDASSET = a.Z_PK AND c.ZISCAPTION = 1
LEFT JOIN ZADDITIONALASSETATTRIBUTES aaa ON aaa.ZASSET = a.Z_PK
LEFT JOIN ZASSETDESCRIPTION ad ON ad.ZASSETATTRIBUTES = aaa.ZASSETDESCRIPTION
WHERE a.ZUUID = '$UUID'
  AND a.ZTRASHEDSTATE = 0
ORDER BY c.ZCOMMENTDATE DESC
LIMIT 1;
" 2>/dev/null

if [ ${PIPESTATUS[0]} -ne 0 ]; then
    echo "Error: Could not query Photos database" >&2
    exit 1
fi

#!/bin/bash
# List all albums in Photos.app (including shared albums)
# Usage: photos-list-albums.sh
# Output: Album Name | Photo Count | Type

PHOTOS_DB=~/Pictures/Photos\ Library.photoslibrary/database/Photos.sqlite

if [ ! -f "$PHOTOS_DB" ]; then
    echo "Error: Photos database not found" >&2
    exit 1
fi

sqlite3 "$PHOTOS_DB" "
SELECT ZTITLE || ' | ' || COUNT(Z_33ASSETS.Z_3ASSETS) || ' | album'
FROM ZGENERICALBUM
LEFT JOIN Z_33ASSETS ON Z_33ASSETS.Z_33ALBUMS = ZGENERICALBUM.Z_PK
WHERE ZGENERICALBUM.ZTITLE IS NOT NULL
  AND ZGENERICALBUM.ZTRASHEDSTATE = 0
  AND ZGENERICALBUM.ZKIND = 2
GROUP BY ZGENERICALBUM.Z_PK

UNION ALL

SELECT ZTITLE || ' | ' || ZASSETCOUNT || ' | shared'
FROM ZSHARE
WHERE ZTITLE IS NOT NULL
  AND ZTRASHEDSTATE = 0

ORDER BY 1;
" 2>/dev/null

if [ $? -ne 0 ]; then
    echo "Error: Could not access Photos database" >&2
    exit 1
fi

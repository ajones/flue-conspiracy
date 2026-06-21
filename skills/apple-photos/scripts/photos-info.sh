#!/bin/bash
# Get detailed info about a photo
# Usage: photos-info.sh <uuid>
# Output: Key-value pairs

UUID="$1"

if [ -z "$UUID" ]; then
    echo "Usage: photos-info.sh <uuid>" >&2
    exit 1
fi

PHOTOS_DB=~/Pictures/Photos\ Library.photoslibrary/database/Photos.sqlite

if [ ! -f "$PHOTOS_DB" ]; then
    echo "Error: Photos database not found" >&2
    exit 1
fi

sqlite3 -separator '|' "$PHOTOS_DB" "
SELECT 
    a.ZUUID,
    a.ZFILENAME,
    datetime(a.ZDATECREATED + 978307200, 'unixepoch', 'localtime'),
    datetime(a.ZMODIFICATIONDATE + 978307200, 'unixepoch', 'localtime'),
    datetime(a.ZADDEDDATE + 978307200, 'unixepoch', 'localtime'),
    a.ZUNIFORMTYPEIDENTIFIER,
    a.ZWIDTH,
    a.ZHEIGHT,
    CASE WHEN a.ZFAVORITE = 1 THEN 'Yes' ELSE 'No' END,
    CASE WHEN a.ZHIDDEN = 1 THEN 'Yes' ELSE 'No' END,
    a.ZLATITUDE,
    a.ZLONGITUDE,
    COALESCE(c.ZCOMMENTTEXT, ad.ZLONGDESCRIPTION, '')
FROM ZASSET a
LEFT JOIN ZCLOUDSHAREDCOMMENT c ON c.ZCOMMENTEDASSET = a.Z_PK AND c.ZISCAPTION = 1
LEFT JOIN ZADDITIONALASSETATTRIBUTES aaa ON aaa.ZASSET = a.Z_PK
LEFT JOIN ZASSETDESCRIPTION ad ON ad.ZASSETATTRIBUTES = aaa.ZASSETDESCRIPTION
WHERE a.ZUUID = '$UUID' 
    AND a.ZTRASHEDSTATE = 0
ORDER BY c.ZCOMMENTDATE DESC
LIMIT 1;
" 2>/dev/null | while IFS='|' read -r uuid filename created modified added type width height favorite hidden lat lon comment; do
    if [ -z "$uuid" ]; then
        echo "Error: Photo with UUID '$UUID' not found" >&2
        exit 1
    fi
    echo "UUID: $uuid"
    echo "Filename: $filename"
    echo "Created: $created"
    echo "Modified: $modified"
    echo "Added: $added"
    echo "Type: $type"
    echo "Dimensions: ${width}x${height}"
    echo "Favorite: $favorite"
    echo "Hidden: $hidden"
    if [ -n "$lat" ] && [ "$lat" != "" ] && [ "$lat" != "0" ] && [ "$lat" != "-180.0" ] && [ "$lat" != "-180" ]; then
        echo "Location: $lat, $lon"
    else
        echo "Location: None"
    fi
    if [ -n "$comment" ]; then
        echo "Comment: $comment"
    fi
done

# Check if anything was output
if [ ${PIPESTATUS[0]} -ne 0 ]; then
    echo "Error: Could not query Photos database" >&2
    exit 1
fi

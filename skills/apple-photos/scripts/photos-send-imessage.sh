#!/bin/bash
# Send a photo from the Photos library via iMessage
# Usage: photos-send-imessage.sh <uuid> <recipient> [message]
# Recipient: phone number (+15551234567), email, group chat name, or chat ID (chat:CHATID)
# Optional message is sent before the photo; if omitted, the photo comment/caption is sent when available

UUID="$1"
RECIPIENT="$2"
MESSAGE="$3"

if [ -z "$UUID" ] || [ -z "$RECIPIENT" ]; then
    echo "Usage: photos-send-imessage.sh <uuid> <recipient> [message]" >&2
    echo "  recipient: phone (+15551234567), email, group name, or chat:CHATID" >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STAGING_PATH=~/Pictures/.photos_send_staging.jpg

# If no explicit message was provided, use the photo's comment/caption when available
if [ -z "$MESSAGE" ]; then
    MESSAGE=$("$SCRIPT_DIR/photos-comment.sh" "$UUID" 2>/dev/null)
fi

# Export the photo
EXPORTED=$("$SCRIPT_DIR/photos-export.sh" "$UUID" "$STAGING_PATH")
if [ $? -ne 0 ] || [ ! -f "$STAGING_PATH" ]; then
    echo "Error: Failed to export photo" >&2
    exit 1
fi

STAGING_FULL_PATH=$(cd ~ && pwd)/Pictures/.photos_send_staging.jpg

# Determine target type: buddy (phone/email) or chat (group name / chat ID)
TARGET_TYPE="buddy"
CHAT_ID=""

if [[ "$RECIPIENT" == chat:* ]]; then
    # Explicit chat ID: chat:any;+;bc2201f8...
    TARGET_TYPE="chat"
    CHAT_ID="${RECIPIENT#chat:}"
elif [[ "$RECIPIENT" != +* && "$RECIPIENT" != *@* ]]; then
    # Not a phone number or email — treat as group chat name
    TARGET_TYPE="chat"
    # Look up the chat ID by name
    CHAT_ID=$(osascript -e "
tell application \"Messages\"
    repeat with c in every chat
        if (name of c) is \"$RECIPIENT\" then
            return id of c
        end if
    end repeat
    return \"\"
end tell" 2>/dev/null)
    if [ -z "$CHAT_ID" ]; then
        echo "Error: No group chat found named \"$RECIPIENT\"" >&2
        rm -f "$STAGING_PATH"
        exit 1
    fi
fi

# Build the AppleScript target expression
if [ "$TARGET_TYPE" = "chat" ]; then
    AS_TARGET="chat id \"$CHAT_ID\""
else
    AS_TARGET="buddy \"$RECIPIENT\" of service id targetService"
fi

# Send optional text message first
if [ -n "$MESSAGE" ]; then
    osascript -e "
tell application \"Messages\"
    set targetService to id of 1st service whose service type = iMessage
    send \"$MESSAGE\" to $AS_TARGET
end tell" 2>/dev/null
    if [ $? -ne 0 ]; then
        echo "Error: Failed to send text message" >&2
        rm -f "$STAGING_PATH"
        exit 1
    fi
fi

# Send the photo
osascript -e "
tell application \"Messages\"
    set targetService to id of 1st service whose service type = iMessage
    set theFile to POSIX file \"$STAGING_FULL_PATH\"
    send theFile to $AS_TARGET
end tell" 2>/dev/null

SEND_STATUS=$?

# Clean up staging file
# NOTE: Disabled automatic cleanup to avoid any chance of the file being removed
# before Messages fully processes it. You can safely delete ~/.photos_send_staging.jpg
# later or add a delayed cleanup if needed.
# rm -f "$STAGING_PATH"

if [ $SEND_STATUS -ne 0 ]; then
    echo "Error: Failed to send photo via iMessage" >&2
    exit 1
fi

echo "Sent to $RECIPIENT"

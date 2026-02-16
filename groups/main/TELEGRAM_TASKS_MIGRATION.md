# Telegram Tasks Migration

## Active Tasks to Migrate

### 1. PhD Research Digest (Daily at 7 AM)
- **ID**: task-1770521676570-i9l5pb
- **Schedule**: 0 7 * * * (every day at 7:00 AM)
- **Action**: Research GIS, GeoAI, humanitarian health, outcome prediction
- **Output**: Telegram message + file saved
- **Status**: Active

### 2. BTC Volatility Alert (Every 30 minutes)
- **ID**: task-1770518391584-wef69l
- **Schedule**: */30 * * * * (every 30 minutes)
- **Action**: Check BTC price, alert if ±3% change
- **Output**: Telegram message only if triggered
- **Status**: Active

### 3. BTC Market Close (Weekdays at 4 PM)
- **ID**: task-1770518343496-flph8h
- **Schedule**: 0 16 * * 1-5 (4:00 PM Mon-Fri)
- **Action**: BTC market summary
- **Output**: Telegram message
- **Status**: Active

### 4. BTC Market Open (Weekdays at 9:30 AM)
- **ID**: task-1770518341470-7vupsx
- **Schedule**: 30 9 * * 1-5 (9:30 AM Mon-Fri)
- **Action**: BTC market summary
- **Output**: Telegram message
- **Status**: Active

## Changes Needed for Telegram

All task prompts need to be updated to:
1. Replace "WhatsApp message" with "Telegram message"
2. Update formatting instructions (Telegram uses Markdown)
3. Use `mcp__nanoclaw__send_message` tool (which will work with Telegram)

These tasks will automatically work with the new Telegram backend once it's running.

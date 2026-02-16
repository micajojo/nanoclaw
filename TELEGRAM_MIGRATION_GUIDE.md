# Telegram Migration Guide

## Overview

This guide explains how to switch from the WhatsApp-based NanoClaw to the Telegram-based version.

## What Changed

### Architecture
- **Before**: Used @whiskeysockets/baileys for WhatsApp messaging
- **After**: Uses Telegram Bot API for messaging
- **Same**: All core functionality (scheduling, tasks, database, containers)

### Files Created
1. `/workspace/project/src/telegram-bot.ts` - Telegram Bot API wrapper
2. `/workspace/project/src/index-telegram.ts` - Main Telegram entry point
3. `/workspace/group/telegram_config.json` - Bot configuration

### Files Modified
1. `package.json` - Added `start:telegram` and `dev:telegram` scripts

## Configuration

The Telegram bot reads configuration from `/workspace/group/telegram_config.json`:

```json
{
  "bot_token": "YOUR_BOT_TOKEN",
  "chat_id": "YOUR_CHAT_ID",
  "setup_date": "2026-02-08T05:05:58.000Z",
  "status": "active"
}
```

## How to Switch

### Step 1: Stop the WhatsApp Service

If NanoClaw is currently running with WhatsApp, stop it:

```bash
# Find the process
ps aux | grep "node.*index.js"

# Kill it (replace PID with actual process ID)
kill <PID>
```

Or if running in the current terminal, just press `Ctrl+C`.

### Step 2: Build the Project

```bash
cd /workspace/project
npm run build
```

### Step 3: Start the Telegram Bot

```bash
npm run start:telegram
```

Or for development with auto-reload:

```bash
npm run dev:telegram
```

## Features

### What Works the Same

✅ **Task Scheduling** - All cron, interval, and one-time tasks work identically
✅ **Database** - Same SQLite database, no migration needed
✅ **Docker Containers** - Same container execution for agent tasks
✅ **IPC Communication** - Tasks can still send messages via IPC
✅ **File Operations** - All file reading/writing works the same

### What Changed

🔄 **Message Format** - Messages are sent via Telegram instead of WhatsApp
🔄 **No Trigger Required** - Telegram is a private bot, so no "@Andy" prefix needed
🔄 **Simplified Chat** - Single private chat instead of multiple WhatsApp groups
🔄 **Markdown Formatting** - Uses Telegram's Markdown format

## Existing Tasks

All your scheduled tasks will continue to work:

1. **PhD Research Digest** (7:00 AM daily)
2. **BTC Volatility Alert** (Every 30 minutes)
3. **BTC Market Close** (4:00 PM weekdays)
4. **BTC Market Open** (9:30 AM weekdays)

The tasks will automatically send messages to Telegram instead of WhatsApp.

## Troubleshooting

### Bot Not Responding

1. Check that the bot token is correct in `telegram_config.json`
2. Verify your chat ID is correct
3. Make sure you've sent `/start` to the bot on Telegram
4. Check logs: `tail -f /workspace/project/logs/app.log`

### Tasks Not Running

1. Verify the bot is running: `ps aux | grep index-telegram`
2. Check the database: tasks are stored in `/workspace/project/store/messages.db`
3. Look at task snapshots: `/workspace/project/data/ipc/main/current_tasks.json`

### Messages Not Sending

1. Test the bot token manually:
```bash
curl "https://api.telegram.org/bot<TOKEN>/sendMessage" \
  -d "chat_id=<CHAT_ID>" \
  -d "text=Test message"
```

2. Check if Docker is running: `docker info`
3. Verify container can access network

## Reverting to WhatsApp

If you need to go back to WhatsApp:

```bash
# Stop Telegram bot
kill <PID>

# Start WhatsApp version
npm run start
```

The original WhatsApp code is backed up at `/workspace/project/src/index-whatsapp.ts.backup`.

## Support

For issues, check:
- Logs: `/workspace/project/logs/`
- Database: `/workspace/project/store/messages.db`
- Task files: `/workspace/project/data/ipc/main/`

## Next Steps

After confirming the Telegram bot works:

1. **Optional**: Set up as a systemd service (Linux) or launchd (macOS) for auto-start
2. **Optional**: Move to a cloud server for 24/7 uptime
3. **Optional**: Remove WhatsApp dependencies to reduce package size

```bash
npm uninstall @whiskeysockets/baileys qrcode-terminal qrcode
```

#!/bin/bash

# NanoClaw Telegram Bot Startup Script

set -e

echo "🤖 Starting NanoClaw Telegram Bot..."

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "❌ Error: Docker is not running"
    echo "Please start Docker Desktop and try again"
    exit 1
fi

# Check if config exists
if [ ! -f "/workspace/group/telegram_config.json" ]; then
    echo "❌ Error: Telegram config not found at /workspace/group/telegram_config.json"
    echo "Please create the config file with your bot token and chat ID"
    exit 1
fi

# Build if needed
if [ ! -f "dist/index-telegram.js" ]; then
    echo "📦 Building project..."
    npm run build
fi

# Start the bot
echo "✅ Starting Telegram bot..."
echo "📱 You can now chat with Andy on Telegram!"
echo "Press Ctrl+C to stop"
echo ""

node dist/index-telegram.js

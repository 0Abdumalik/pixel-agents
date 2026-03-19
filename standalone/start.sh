#!/usr/bin/env bash
# Pixel Agents Office - Linux/Mac Launcher
set -e

PORT="${PORT:-3000}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo ""
echo "  🎮 Pixel Agents Office - Aperture Science Edition"
echo "  ================================================"
echo ""

# Check Node.js
if ! command -v node &>/dev/null; then
    echo "  [ERROR] Node.js not found. Install from https://nodejs.org"
    exit 1
fi
echo "  Node.js: $(node --version)"

# Install dependencies
if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    echo "  Installing dependencies..."
    cd "$SCRIPT_DIR" && npm install --silent
    echo "  Dependencies installed."
fi

# Build frontend
if [ ! -f "$PROJECT_ROOT/dist/webview/index.html" ]; then
    echo "  Building frontend..."
    cd "$PROJECT_ROOT/webview-ui"
    [ ! -d "node_modules" ] && npm install --silent
    npm run build --silent
    echo "  Frontend built."
fi

# Check Claude projects
CLAUDE_DIR="$HOME/.claude/projects"
if [ -d "$CLAUDE_DIR" ]; then
    COUNT=$(find "$CLAUDE_DIR" -maxdepth 1 -type d | wc -l)
    echo "  Claude projects: $((COUNT - 1)) found"
else
    echo "  Claude projects dir not found (will create on first use)"
fi

echo ""
echo "  Starting server on port $PORT..."
echo "  Open: http://localhost:$PORT"
echo "  Press Ctrl+C to stop"
echo ""

# Open browser (best effort)
(sleep 2 && (xdg-open "http://localhost:$PORT" 2>/dev/null || open "http://localhost:$PORT" 2>/dev/null || true)) &

cd "$SCRIPT_DIR"
PORT=$PORT exec node server.js

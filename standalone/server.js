#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');

// ── Constants ────────────────────────────────────────────────
const JSONL_POLL_INTERVAL_MS = 1000;
const PROJECT_SCAN_INTERVAL_MS = 1000;
const TOOL_DONE_DELAY_MS = 300;
const PERMISSION_TIMER_DELAY_MS = 7000;
const TEXT_IDLE_DELAY_MS = 5000;
const BASH_COMMAND_DISPLAY_MAX_LENGTH = 30;
const TASK_DESCRIPTION_DISPLAY_MAX_LENGTH = 40;

const PERMISSION_EXEMPT_TOOLS = new Set(['Task', 'Agent', 'AskUserQuestion']);

const PORT = parseInt(process.env.PORT, 10) || 3000;
const STATIC_DIR = path.resolve(__dirname, '..', 'dist', 'webview');
const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

// ── MIME types ───────────────────────────────────────────────
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};

// ── State ────────────────────────────────────────────────────
const agents = new Map();          // id → AgentState
const knownJsonlFiles = new Set(); // absolute paths
const waitingTimers = new Map();   // agentId → timeout
const permissionTimers = new Map();// agentId → timeout
const pollingTimers = new Map();   // agentId → interval
const fileWatchers = new Map();    // agentId → fs.FSWatcher
let nextAgentId = 1;
let projectScanTimer = null;
const wsClients = new Set();

// ── AgentState factory ───────────────────────────────────────
function createAgentState(id, projectDir, jsonlFile) {
  return {
    id,
    projectDir,
    jsonlFile,
    fileOffset: 0,
    lineBuffer: '',
    activeToolIds: new Set(),
    activeToolStatuses: new Map(),
    activeToolNames: new Map(),
    activeSubagentToolIds: new Map(),   // parentToolId → Set<subToolId>
    activeSubagentToolNames: new Map(), // parentToolId → Map<subToolId, toolName>
    isWaiting: false,
    permissionSent: false,
    hadToolsInTurn: false,
    folderName: path.basename(projectDir),
  };
}

// ── WebSocket broadcast ──────────────────────────────────────
function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const ws of wsClients) {
    if (ws.readyState === 1) ws.send(data);
  }
}

// ── Timer management ─────────────────────────────────────────
function cancelWaitingTimer(agentId) {
  const t = waitingTimers.get(agentId);
  if (t) { clearTimeout(t); waitingTimers.delete(agentId); }
}

function startWaitingTimer(agentId, delayMs) {
  cancelWaitingTimer(agentId);
  const t = setTimeout(() => {
    waitingTimers.delete(agentId);
    const agent = agents.get(agentId);
    if (agent) agent.isWaiting = true;
    broadcast({ type: 'agentStatus', id: agentId, status: 'waiting' });
  }, delayMs);
  waitingTimers.set(agentId, t);
}

function cancelPermissionTimer(agentId) {
  const t = permissionTimers.get(agentId);
  if (t) { clearTimeout(t); permissionTimers.delete(agentId); }
}

function startPermissionTimer(agentId) {
  cancelPermissionTimer(agentId);
  const t = setTimeout(() => {
    permissionTimers.delete(agentId);
    const agent = agents.get(agentId);
    if (!agent) return;

    let hasNonExempt = false;
    for (const toolId of agent.activeToolIds) {
      const toolName = agent.activeToolNames.get(toolId);
      if (!PERMISSION_EXEMPT_TOOLS.has(toolName || '')) { hasNonExempt = true; break; }
    }

    const stuckSubagentParentToolIds = [];
    for (const [parentToolId, subToolNames] of agent.activeSubagentToolNames) {
      for (const [, toolName] of subToolNames) {
        if (!PERMISSION_EXEMPT_TOOLS.has(toolName)) {
          stuckSubagentParentToolIds.push(parentToolId);
          hasNonExempt = true;
          break;
        }
      }
    }

    if (hasNonExempt) {
      agent.permissionSent = true;
      console.log(`[Agent ${agentId}] possible permission wait detected`);
      broadcast({ type: 'agentToolPermission', id: agentId });
      for (const pid of stuckSubagentParentToolIds) {
        broadcast({ type: 'subagentToolPermission', id: agentId, parentToolId: pid });
      }
    }
  }, PERMISSION_TIMER_DELAY_MS);
  permissionTimers.set(agentId, t);
}

function clearAgentActivity(agent, agentId) {
  if (!agent) return;
  agent.activeToolIds.clear();
  agent.activeToolStatuses.clear();
  agent.activeToolNames.clear();
  agent.activeSubagentToolIds.clear();
  agent.activeSubagentToolNames.clear();
  agent.isWaiting = false;
  agent.permissionSent = false;
  cancelPermissionTimer(agentId);
  broadcast({ type: 'agentToolsClear', id: agentId });
  broadcast({ type: 'agentStatus', id: agentId, status: 'active' });
}

// ── Tool status formatting ───────────────────────────────────
function formatToolStatus(toolName, input) {
  const base = (p) => (typeof p === 'string' ? path.basename(p) : '');
  switch (toolName) {
    case 'Read':  return `Reading ${base(input.file_path)}`;
    case 'Edit':  return `Editing ${base(input.file_path)}`;
    case 'Write': return `Writing ${base(input.file_path)}`;
    case 'Bash': {
      const cmd = input.command || '';
      return `Running: ${cmd.length > BASH_COMMAND_DISPLAY_MAX_LENGTH ? cmd.slice(0, BASH_COMMAND_DISPLAY_MAX_LENGTH) + '\u2026' : cmd}`;
    }
    case 'Glob':      return 'Searching files';
    case 'Grep':      return 'Searching code';
    case 'WebFetch':  return 'Fetching web content';
    case 'WebSearch':  return 'Searching the web';
    case 'Task':
    case 'Agent': {
      const desc = typeof input.description === 'string' ? input.description : '';
      return desc
        ? `Subtask: ${desc.length > TASK_DESCRIPTION_DISPLAY_MAX_LENGTH ? desc.slice(0, TASK_DESCRIPTION_DISPLAY_MAX_LENGTH) + '\u2026' : desc}`
        : 'Running subtask';
    }
    case 'AskUserQuestion': return 'Waiting for your answer';
    case 'EnterPlanMode':   return 'Planning';
    case 'NotebookEdit':    return 'Editing notebook';
    default: return `Using ${toolName}`;
  }
}

// ── Transcript parser ────────────────────────────────────────
function processTranscriptLine(agentId, line) {
  const agent = agents.get(agentId);
  if (!agent) return;
  let record;
  try { record = JSON.parse(line); } catch { return; }

  if (record.type === 'assistant' && Array.isArray(record.message?.content)) {
    const blocks = record.message.content;
    const hasToolUse = blocks.some((b) => b.type === 'tool_use');

    if (hasToolUse) {
      cancelWaitingTimer(agentId);
      agent.isWaiting = false;
      agent.hadToolsInTurn = true;
      broadcast({ type: 'agentStatus', id: agentId, status: 'active' });
      let hasNonExemptTool = false;
      for (const block of blocks) {
        if (block.type === 'tool_use' && block.id) {
          const toolName = block.name || '';
          const status = formatToolStatus(toolName, block.input || {});
          agent.activeToolIds.add(block.id);
          agent.activeToolStatuses.set(block.id, status);
          agent.activeToolNames.set(block.id, toolName);
          if (!PERMISSION_EXEMPT_TOOLS.has(toolName)) hasNonExemptTool = true;
          broadcast({ type: 'agentToolStart', id: agentId, toolId: block.id, status });
        }
      }
      if (hasNonExemptTool) startPermissionTimer(agentId);
    } else if (blocks.some((b) => b.type === 'text') && !agent.hadToolsInTurn) {
      startWaitingTimer(agentId, TEXT_IDLE_DELAY_MS);
    }

  } else if (record.type === 'progress') {
    processProgressRecord(agentId, record);

  } else if (record.type === 'user') {
    const content = record.message?.content;
    if (Array.isArray(content)) {
      const hasToolResult = content.some((b) => b.type === 'tool_result');
      if (hasToolResult) {
        for (const block of content) {
          if (block.type === 'tool_result' && block.tool_use_id) {
            const completedToolId = block.tool_use_id;
            const completedToolName = agent.activeToolNames.get(completedToolId);
            if (completedToolName === 'Task' || completedToolName === 'Agent') {
              agent.activeSubagentToolIds.delete(completedToolId);
              agent.activeSubagentToolNames.delete(completedToolId);
              broadcast({ type: 'subagentClear', id: agentId, parentToolId: completedToolId });
            }
            agent.activeToolIds.delete(completedToolId);
            agent.activeToolStatuses.delete(completedToolId);
            agent.activeToolNames.delete(completedToolId);
            const toolId = completedToolId;
            setTimeout(() => {
              broadcast({ type: 'agentToolDone', id: agentId, toolId });
            }, TOOL_DONE_DELAY_MS);
          }
        }
        if (agent.activeToolIds.size === 0) agent.hadToolsInTurn = false;
      } else {
        cancelWaitingTimer(agentId);
        clearAgentActivity(agent, agentId);
        agent.hadToolsInTurn = false;
      }
    } else if (typeof content === 'string' && content.trim()) {
      cancelWaitingTimer(agentId);
      clearAgentActivity(agent, agentId);
      agent.hadToolsInTurn = false;
    }

  } else if (record.type === 'system' && record.subtype === 'turn_duration') {
    cancelWaitingTimer(agentId);
    cancelPermissionTimer(agentId);
    if (agent.activeToolIds.size > 0) {
      agent.activeToolIds.clear();
      agent.activeToolStatuses.clear();
      agent.activeToolNames.clear();
      agent.activeSubagentToolIds.clear();
      agent.activeSubagentToolNames.clear();
      broadcast({ type: 'agentToolsClear', id: agentId });
    }
    agent.isWaiting = true;
    agent.permissionSent = false;
    agent.hadToolsInTurn = false;
    broadcast({ type: 'agentStatus', id: agentId, status: 'waiting' });
  }
}

function processProgressRecord(agentId, record) {
  const agent = agents.get(agentId);
  if (!agent) return;
  const parentToolId = record.parentToolUseID;
  if (!parentToolId) return;
  const data = record.data;
  if (!data) return;

  const dataType = data.type;
  if (dataType === 'bash_progress' || dataType === 'mcp_progress') {
    if (agent.activeToolIds.has(parentToolId)) startPermissionTimer(agentId);
    return;
  }

  const parentToolName = agent.activeToolNames.get(parentToolId);
  if (parentToolName !== 'Task' && parentToolName !== 'Agent') return;

  const msg = data.message;
  if (!msg) return;
  const msgType = msg.type;
  const innerMsg = msg.message;
  const content = innerMsg?.content;
  if (!Array.isArray(content)) return;

  if (msgType === 'assistant') {
    let hasNonExemptSubTool = false;
    for (const block of content) {
      if (block.type === 'tool_use' && block.id) {
        const toolName = block.name || '';
        const status = formatToolStatus(toolName, block.input || {});
        let subTools = agent.activeSubagentToolIds.get(parentToolId);
        if (!subTools) { subTools = new Set(); agent.activeSubagentToolIds.set(parentToolId, subTools); }
        subTools.add(block.id);
        let subNames = agent.activeSubagentToolNames.get(parentToolId);
        if (!subNames) { subNames = new Map(); agent.activeSubagentToolNames.set(parentToolId, subNames); }
        subNames.set(block.id, toolName);
        if (!PERMISSION_EXEMPT_TOOLS.has(toolName)) hasNonExemptSubTool = true;
        broadcast({ type: 'subagentToolStart', id: agentId, parentToolId, toolId: block.id, status });
      }
    }
    if (hasNonExemptSubTool) startPermissionTimer(agentId);
  } else if (msgType === 'user') {
    for (const block of content) {
      if (block.type === 'tool_result' && block.tool_use_id) {
        const subTools = agent.activeSubagentToolIds.get(parentToolId);
        if (subTools) subTools.delete(block.tool_use_id);
        const subNames = agent.activeSubagentToolNames.get(parentToolId);
        if (subNames) subNames.delete(block.tool_use_id);
        const toolId = block.tool_use_id;
        setTimeout(() => {
          broadcast({ type: 'subagentToolDone', id: agentId, parentToolId, toolId });
        }, TOOL_DONE_DELAY_MS);
      }
    }
    let stillHasNonExempt = false;
    for (const [, subNames] of agent.activeSubagentToolNames) {
      for (const [, toolName] of subNames) {
        if (!PERMISSION_EXEMPT_TOOLS.has(toolName)) { stillHasNonExempt = true; break; }
      }
      if (stillHasNonExempt) break;
    }
    if (stillHasNonExempt) startPermissionTimer(agentId);
  }
}

// ── File reading ─────────────────────────────────────────────
function readNewLines(agentId) {
  const agent = agents.get(agentId);
  if (!agent) return;
  try {
    const stat = fs.statSync(agent.jsonlFile);
    if (stat.size <= agent.fileOffset) return;

    const buf = Buffer.alloc(stat.size - agent.fileOffset);
    const fd = fs.openSync(agent.jsonlFile, 'r');
    fs.readSync(fd, buf, 0, buf.length, agent.fileOffset);
    fs.closeSync(fd);
    agent.fileOffset = stat.size;

    const text = agent.lineBuffer + buf.toString('utf-8');
    const lines = text.split('\n');
    agent.lineBuffer = lines.pop() || '';

    const hasLines = lines.some((l) => l.trim());
    if (hasLines) {
      cancelWaitingTimer(agentId);
      cancelPermissionTimer(agentId);
      if (agent.permissionSent) {
        agent.permissionSent = false;
        broadcast({ type: 'agentToolPermissionClear', id: agentId });
      }
    }

    for (const line of lines) {
      if (!line.trim()) continue;
      processTranscriptLine(agentId, line);
    }
  } catch (e) {
    // file may be temporarily unavailable
  }
}

// ── File watching ────────────────────────────────────────────
function startFileWatching(agentId, filePath) {
  try {
    const watcher = fs.watch(filePath, () => readNewLines(agentId));
    fileWatchers.set(agentId, watcher);
  } catch { /* ignore */ }

  try {
    fs.watchFile(filePath, { interval: JSONL_POLL_INTERVAL_MS }, () => readNewLines(agentId));
  } catch { /* ignore */ }

  const interval = setInterval(() => {
    if (!agents.has(agentId)) {
      clearInterval(interval);
      try { fs.unwatchFile(filePath); } catch { /* ignore */ }
      return;
    }
    readNewLines(agentId);
  }, JSONL_POLL_INTERVAL_MS);
  pollingTimers.set(agentId, interval);
}

// ── Project scanning ─────────────────────────────────────────
function discoverAllProjectDirs() {
  const dirs = [];
  try {
    const entries = fs.readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        dirs.push(path.join(CLAUDE_PROJECTS_DIR, entry.name));
      }
    }
  } catch { /* ~/.claude/projects may not exist */ }
  return dirs;
}

function scanProjectDir(projectDir) {
  let files;
  try {
    files = fs.readdirSync(projectDir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => path.join(projectDir, f));
  } catch { return; }

  for (const file of files) {
    if (knownJsonlFiles.has(file)) continue;
    knownJsonlFiles.add(file);

    // Check if file has been modified recently (within last 30 seconds = likely active)
    try {
      const stat = fs.statSync(file);
      const ageMs = Date.now() - stat.mtimeMs;
      if (ageMs > 30000) continue; // skip old files
    } catch { continue; }

    const id = nextAgentId++;
    const agent = createAgentState(id, projectDir, file);
    agents.set(id, agent);

    console.log(`[Agent ${id}] discovered: ${path.basename(file)} in ${path.basename(projectDir)}`);
    broadcast({ type: 'agentCreated', id, folderName: agent.folderName });

    startFileWatching(id, file);
    readNewLines(id);
  }
}

function startProjectScanning() {
  // Initial seed: mark all existing JSONL files as known
  const projectDirs = discoverAllProjectDirs();
  for (const dir of projectDirs) {
    try {
      const files = fs.readdirSync(dir)
        .filter((f) => f.endsWith('.jsonl'))
        .map((f) => path.join(dir, f));
      for (const f of files) knownJsonlFiles.add(f);
    } catch { /* ignore */ }
  }

  // Periodic scan for new files
  projectScanTimer = setInterval(() => {
    const dirs = discoverAllProjectDirs();
    for (const dir of dirs) {
      scanProjectDir(dir);
    }
  }, PROJECT_SCAN_INTERVAL_MS);
}

// ── Send full state to a newly connected client ──────────────
function sendFullState(ws) {
  const agentIds = [...agents.keys()].sort((a, b) => a - b);
  const folderNames = {};
  for (const [id, agent] of agents) {
    if (agent.folderName) folderNames[id] = agent.folderName;
  }

  ws.send(JSON.stringify({
    type: 'existingAgents',
    agents: agentIds,
    agentMeta: {},
    folderNames,
  }));

  // Re-send current statuses
  for (const [agentId, agent] of agents) {
    for (const [toolId, status] of agent.activeToolStatuses) {
      ws.send(JSON.stringify({ type: 'agentToolStart', id: agentId, toolId, status }));
    }
    if (agent.isWaiting) {
      ws.send(JSON.stringify({ type: 'agentStatus', id: agentId, status: 'waiting' }));
    }
    if (agent.permissionSent) {
      ws.send(JSON.stringify({ type: 'agentToolPermission', id: agentId }));
    }
  }
}

// ── HTTP static file server ──────────────────────────────────
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(STATIC_DIR, urlPath);

  // Prevent directory traversal
  if (!filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback: serve index.html for non-file routes
      if (err.code === 'ENOENT') {
        const indexPath = path.join(STATIC_DIR, 'index.html');
        fs.readFile(indexPath, (err2, indexData) => {
          if (err2) {
            res.writeHead(404);
            res.end('Not Found');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(indexData);
        });
        return;
      }
      res.writeHead(500);
      res.end('Internal Server Error');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

// ── WebSocket server ─────────────────────────────────────────
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  wsClients.add(ws);
  console.log(`[WS] client connected (total: ${wsClients.size})`);

  // Send current state
  sendFullState(ws);

  ws.on('message', (raw) => {
    // Handle messages from frontend if needed
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'requestAgents') {
        sendFullState(ws);
      }
    } catch { /* ignore */ }
  });

  ws.on('close', () => {
    wsClients.delete(ws);
    console.log(`[WS] client disconnected (total: ${wsClients.size})`);
  });
});

// ── Cleanup on exit ──────────────────────────────────────────
function cleanup() {
  if (projectScanTimer) clearInterval(projectScanTimer);
  for (const [, timer] of pollingTimers) clearInterval(timer);
  for (const [, watcher] of fileWatchers) { try { watcher.close(); } catch {} }
  for (const [, timer] of waitingTimers) clearTimeout(timer);
  for (const [, timer] of permissionTimers) clearTimeout(timer);
  for (const agent of agents.values()) {
    try { fs.unwatchFile(agent.jsonlFile); } catch {}
  }
}

process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });

// ── Start ────────────────────────────────────────────────────
startProjectScanning();

server.listen(PORT, () => {
  console.log(`\n  🎮 Pixel Agents standalone server`);
  console.log(`  ├─ HTTP:      http://localhost:${PORT}`);
  console.log(`  ├─ WebSocket: ws://localhost:${PORT}`);
  console.log(`  ├─ Static:    ${STATIC_DIR}`);
  console.log(`  └─ Watching:  ${CLAUDE_PROJECTS_DIR}\n`);
});

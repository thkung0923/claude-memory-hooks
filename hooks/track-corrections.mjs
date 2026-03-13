import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';

/**
 * PostToolUse hook: Tracks file edits to detect potential corrections.
 * Matches: Edit|Write
 *
 * When the same file is edited 2+ times in one session, logs it to corrections.md
 * as a potential correction that Claude should review and document.
 */

function getMemoryDir() {
  if (process.env.CLAUDE_MEMORY_DIR) {
    return resolve(process.env.CLAUDE_MEMORY_DIR);
  }
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const projectHash = projectDir
    .replace(/^[a-zA-Z]:/, m => m[0].toUpperCase())
    .replace(/[:\/\\]/g, '-')
    .replace(/-+/g, '-')
    .replace(/-$/, '');
  return join(home, '.claude', 'projects', projectHash, 'memory');
}

function getHooksDir() {
  if (process.env.CLAUDE_HOOKS_DIR) {
    return resolve(process.env.CLAUDE_HOOKS_DIR);
  }
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  return join(projectDir, '.claude', 'hooks');
}

async function main() {
  try {
    let input = '';
    for await (const chunk of process.stdin) {
      input += chunk;
    }
    const data = JSON.parse(input);

    const toolName = data.tool_name || '';
    const toolInput = data.tool_input || {};
    const sessionId = data.session_id || data.conversation_id || 'unknown';

    if (!['Edit', 'Write'].includes(toolName)) {
      console.log('{}');
      process.exit(0);
    }

    const filePath = toolInput.file_path || '';
    if (!filePath) {
      console.log('{}');
      process.exit(0);
    }

    const hooksDir = getHooksDir();
    const trackerFile = join(hooksDir, '.edit-tracker.json');
    const memoryDir = getMemoryDir();
    const correctionsFile = join(memoryDir, 'corrections.md');

    // Load or create tracker
    let tracker = {};
    try {
      if (existsSync(trackerFile)) {
        tracker = JSON.parse(readFileSync(trackerFile, 'utf-8'));
      }
    } catch {
      tracker = {};
    }

    // Clean old sessions (older than 24h)
    const now = Date.now();
    for (const sid of Object.keys(tracker)) {
      if (tracker[sid]._timestamp && now - tracker[sid]._timestamp > 86400000) {
        delete tracker[sid];
      }
    }

    // Initialize session entry
    if (!tracker[sessionId]) {
      tracker[sessionId] = { _timestamp: now };
    }

    // Track this file edit
    const fileKey = filePath.replace(/\\/g, '/');
    if (!tracker[sessionId][fileKey]) {
      tracker[sessionId][fileKey] = { count: 0, timestamps: [] };
    }

    tracker[sessionId][fileKey].count++;
    tracker[sessionId][fileKey].timestamps.push(new Date().toISOString());

    // If file edited 2+ times in same session, log potential correction
    if (tracker[sessionId][fileKey].count === 2) {
      const date = new Date().toISOString().split('T')[0];
      const fileName = fileKey.split('/').pop();
      const entry = `\n### ${date} auto-detected\n- **File**: \`${fileName}\` edited ${tracker[sessionId][fileKey].count}+ times in one session\n- **Possible correction**: Same file was modified multiple times, which may indicate a fix or refinement\n- **Action needed**: Claude should review and log the actual correction details\n\n`;

      try {
        appendFileSync(correctionsFile, entry, 'utf-8');
      } catch {
        // corrections.md might not exist yet, ignore
      }
    }

    // Save tracker
    writeFileSync(trackerFile, JSON.stringify(tracker, null, 2), 'utf-8');

    console.log('{}');
    process.exit(0);
  } catch (err) {
    process.stderr.write(`track-corrections error: ${err.message}\n`);
    console.log('{}');
    process.exit(0);
  }
}

main();

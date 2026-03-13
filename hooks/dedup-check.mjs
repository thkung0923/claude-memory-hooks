import { readFileSync, existsSync } from 'fs';
import { resolve, normalize, join } from 'path';

/**
 * PreToolUse hook: Prevents duplicate content from being written to memory files.
 * Matches: Edit|Write
 *
 * Checks if >70% of the new content already exists in the target file.
 * Only applies to files inside the configured memory directory.
 */

function getMemoryDir() {
  // Check environment variable first (set by install script)
  if (process.env.CLAUDE_MEMORY_DIR) {
    return resolve(process.env.CLAUDE_MEMORY_DIR);
  }

  // Fallback: derive from Claude's project directory structure
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  // Convert project path to Claude's project hash format (e.g., D--claude)
  const projectHash = projectDir
    .replace(/^[a-zA-Z]:/, m => m[0].toUpperCase())
    .replace(/[:\/\\]/g, '-')
    .replace(/-+/g, '-')
    .replace(/-$/, '');

  return join(home, '.claude', 'projects', projectHash, 'memory');
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

    if (!['Edit', 'Write'].includes(toolName)) {
      console.log('{}');
      process.exit(0);
    }

    const filePath = toolInput.file_path || '';
    const memoryDir = getMemoryDir();
    const normalizedFile = normalize(filePath).toLowerCase();
    const normalizedMemDir = normalize(memoryDir).toLowerCase();

    // Only check files in the memory directory
    if (!normalizedFile.startsWith(normalizedMemDir)) {
      console.log('{}');
      process.exit(0);
    }

    // Get the new content being written
    let newContent = '';
    if (toolName === 'Write') {
      newContent = toolInput.content || '';
    } else if (toolName === 'Edit') {
      newContent = toolInput.new_string || '';
    }

    if (!newContent || newContent.length < 30) {
      console.log('{}');
      process.exit(0);
    }

    // Read existing file content
    let existingContent = '';
    try {
      existingContent = readFileSync(filePath, 'utf-8');
    } catch {
      console.log('{}');
      process.exit(0);
    }

    if (!existingContent) {
      console.log('{}');
      process.exit(0);
    }

    // Normalize for comparison
    const normExisting = existingContent.toLowerCase().replace(/\s+/g, ' ').trim();

    // Split new content into chunks (lines > 20 chars)
    const chunks = newContent
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      .split(/\n/)
      .map(l => l.trim())
      .filter(l => l.length > 20);

    if (chunks.length === 0) {
      console.log('{}');
      process.exit(0);
    }

    const duplicateCount = chunks.filter(chunk => normExisting.includes(chunk)).length;
    const dupeRatio = duplicateCount / chunks.length;

    if (dupeRatio > 0.7) {
      console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `Memory dedup: ${Math.round(dupeRatio * 100)}% of content already exists in this file. Search existing memories before writing, or update the existing entry instead.`
        }
      }));
      process.exit(0);
    }

    console.log('{}');
    process.exit(0);
  } catch (err) {
    process.stderr.write(`dedup-check error: ${err.message}\n`);
    console.log('{}');
    process.exit(0);
  }
}

main();

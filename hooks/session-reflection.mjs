import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';

/**
 * Stop hook: Analyzes correction log and synthesizes repeated patterns into rules.
 *
 * Reads corrections.md, groups entries by category tag, and when a category
 * appears 2+ times, extracts the Rule and writes it to learned_rules.md.
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

async function main() {
  try {
    let input = '';
    for await (const chunk of process.stdin) {
      input += chunk;
    }
    const data = JSON.parse(input);

    // Prevent infinite loop
    if (data.stop_hook_active) {
      console.log('{}');
      process.exit(0);
    }

    const memoryDir = getMemoryDir();
    const correctionsFile = join(memoryDir, 'corrections.md');
    const rulesFile = join(memoryDir, 'learned_rules.md');

    if (!existsSync(correctionsFile)) {
      console.log('{}');
      process.exit(0);
    }

    const corrections = readFileSync(correctionsFile, 'utf-8');

    // Parse entries by category tag
    // Format: ### YYYY-MM-DD category-tag
    const entryRegex = /^### \d{4}-\d{2}-\d{2} (.+)$/gm;
    const categories = {};
    let match;

    while ((match = entryRegex.exec(corrections)) !== null) {
      const tag = match[1].trim().toLowerCase();
      if (!categories[tag]) {
        categories[tag] = [];
      }
      categories[tag].push(match.index);
    }

    // Read existing rules to avoid duplicates
    let existingRules = '';
    try {
      if (existsSync(rulesFile)) {
        existingRules = readFileSync(rulesFile, 'utf-8').toLowerCase();
      }
    } catch {
      existingRules = '';
    }

    // Find categories with 2+ entries that don't have rules yet
    const newRules = [];
    for (const [tag, indices] of Object.entries(categories)) {
      if (tag === 'auto-detected') continue; // Skip auto-detected entries
      if (indices.length < 2) continue;
      if (existingRules.includes(`category: ${tag}`)) continue;

      // Extract the Rule line from the most recent entry
      const lastIndex = indices[indices.length - 1];
      const nextEntry = corrections.indexOf('\n### ', lastIndex + 1);
      const entryText = corrections.substring(
        lastIndex,
        nextEntry > -1 ? nextEntry : corrections.length
      );

      const ruleMatch = entryText.match(/\*\*Rule\*\*:\s*(.+)/);
      const rule = ruleMatch
        ? ruleMatch[1].trim()
        : `Repeated issue in category "${tag}" (${indices.length} occurrences) - review corrections.md for details`;

      newRules.push({ tag, count: indices.length, rule });
    }

    if (newRules.length === 0) {
      console.log('{}');
      process.exit(0);
    }

    // Append new rules
    const date = new Date().toISOString().split('T')[0];
    let rulesContent = existsSync(rulesFile)
      ? readFileSync(rulesFile, 'utf-8')
      : '# Learned Rules\n\nRules synthesized from repeated corrections.\n\n';

    for (const { tag, count, rule } of newRules) {
      rulesContent += `\n## ${rule}\n- **Category**: ${tag}\n- **Occurrences**: ${count}\n- **Synthesized**: ${date}\n\n`;
    }

    writeFileSync(rulesFile, rulesContent, 'utf-8');

    console.log('{}');
    process.exit(0);
  } catch (err) {
    process.stderr.write(`session-reflection error: ${err.message}\n`);
    console.log('{}');
    process.exit(0);
  }
}

main();

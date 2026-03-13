#!/usr/bin/env node

/**
 * Claude Memory Hooks - Installer
 *
 * Installs correction tracking, auto-reflection, and write dedup hooks
 * into your Claude Code project.
 *
 * Usage:
 *   node install.mjs                    # Interactive install
 *   node install.mjs --project /path    # Specify project directory
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { createInterface } from 'readline';

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1'));

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log('\n🧠 Claude Memory Hooks - Installer\n');

  // Determine project directory
  let projectDir = process.argv.find((a, i) => process.argv[i - 1] === '--project');
  if (!projectDir) {
    projectDir = await ask(`Project directory [${process.cwd()}]: `);
    if (!projectDir) projectDir = process.cwd();
  }
  projectDir = resolve(projectDir);

  const claudeDir = join(projectDir, '.claude');
  const hooksDir = join(claudeDir, 'hooks');
  const settingsFile = join(claudeDir, 'settings.json');

  // Determine memory directory
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const projectHash = projectDir
    .replace(/^[a-zA-Z]:/, m => m[0].toUpperCase())
    .replace(/[:\/\\]/g, '-')
    .replace(/-+/g, '-')
    .replace(/-$/, '');
  const defaultMemDir = join(home, '.claude', 'projects', projectHash, 'memory');

  let memoryDir = await ask(`Memory directory [${defaultMemDir}]: `);
  if (!memoryDir) memoryDir = defaultMemDir;
  memoryDir = resolve(memoryDir);

  console.log(`\nProject:  ${projectDir}`);
  console.log(`Hooks:    ${hooksDir}`);
  console.log(`Memory:   ${memoryDir}\n`);

  // Create directories
  mkdirSync(hooksDir, { recursive: true });
  mkdirSync(memoryDir, { recursive: true });

  // Copy hook scripts
  const hookFiles = ['dedup-check.mjs', 'track-corrections.mjs', 'session-reflection.mjs'];
  for (const file of hookFiles) {
    const src = join(SCRIPT_DIR, 'hooks', file);
    const dest = join(hooksDir, file);
    copyFileSync(src, dest);
    console.log(`  Copied ${file}`);
  }

  // Copy template files (only if they don't exist)
  const templates = ['corrections.md', 'learned_rules.md'];
  for (const file of templates) {
    const dest = join(memoryDir, file);
    if (!existsSync(dest)) {
      copyFileSync(join(SCRIPT_DIR, 'templates', file), dest);
      console.log(`  Created ${file}`);
    } else {
      console.log(`  Skipped ${file} (already exists)`);
    }
  }

  // Configure hooks in settings.json
  let settings = {};
  if (existsSync(settingsFile)) {
    try {
      settings = JSON.parse(readFileSync(settingsFile, 'utf-8'));
    } catch {
      settings = {};
    }
  }

  const hooksPath = hooksDir.replace(/\\/g, '/');

  settings.hooks = settings.hooks || {};

  // PostToolUse: track-corrections
  settings.hooks.PostToolUse = settings.hooks.PostToolUse || [];
  if (!settings.hooks.PostToolUse.some(h => h.hooks?.some(hh => hh.command?.includes('track-corrections')))) {
    settings.hooks.PostToolUse.push({
      matcher: 'Edit|Write',
      hooks: [{
        type: 'command',
        command: `node "${hooksPath}/track-corrections.mjs"`,
        timeout: 10
      }]
    });
  }

  // Stop: session-reflection
  settings.hooks.Stop = settings.hooks.Stop || [];
  if (!settings.hooks.Stop.some(h => h.hooks?.some(hh => hh.command?.includes('session-reflection')))) {
    settings.hooks.Stop.push({
      hooks: [{
        type: 'command',
        command: `node "${hooksPath}/session-reflection.mjs"`,
        timeout: 10
      }]
    });
  }

  // PreToolUse: dedup-check
  settings.hooks.PreToolUse = settings.hooks.PreToolUse || [];
  if (!settings.hooks.PreToolUse.some(h => h.hooks?.some(hh => hh.command?.includes('dedup-check')))) {
    settings.hooks.PreToolUse.push({
      matcher: 'Edit|Write',
      hooks: [{
        type: 'command',
        command: `node "${hooksPath}/dedup-check.mjs"`,
        timeout: 5
      }]
    });
  }

  writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf-8');
  console.log(`  Updated ${settingsFile}`);

  console.log(`
Installation complete! Add the following to your MEMORY.md:

## Self-Correction Protocol
- When the user corrects your output, log it to corrections.md
- Format: ### [YYYY-MM-DD] category-tag
- Hook auto-detects same-file 2+ edits; add details manually
- Check learned_rules.md at session start for past lessons

## Memory Dedup Protocol
- Before save_observation, ALWAYS search existing memories first
- If similar content exists (>70% overlap), update instead of creating new
- Hook auto-blocks duplicate writes to memory files
`);
}

main().catch(err => {
  console.error('Install failed:', err.message);
  process.exit(1);
});

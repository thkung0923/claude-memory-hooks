# Claude Memory Hooks

Lightweight memory enhancement for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) — learn from mistakes, auto-synthesize rules, prevent duplicate memories.

**Zero dependencies. Pure Node.js. Works on Windows, macOS, and Linux.**

## Features

### 1. Correction Tracking (`track-corrections.mjs`)
**Hook type**: PostToolUse (Edit|Write)

Automatically detects when the same file is edited 2+ times in a session — a signal that Claude's output was corrected. Logs these to `corrections.md` for review.

Combined with behavioral instructions in MEMORY.md, Claude also self-logs corrections when the user says "no", "that's wrong", or asks for a redo.

### 2. Auto Reflection (`session-reflection.mjs`)
**Hook type**: Stop

When a conversation ends, analyzes `corrections.md` for repeated patterns. If the same category of mistake appears 2+ times, it synthesizes a rule and writes it to `learned_rules.md`.

Over time, Claude builds up a personal rulebook derived from actual mistakes — not generic best practices.

### 3. Write Dedup (`dedup-check.mjs`)
**Hook type**: PreToolUse (Edit|Write)

Before writing to any file in the memory directory, checks if >70% of the content already exists. If so, blocks the write and tells Claude to update the existing entry instead.

Prevents memory bloat from duplicate entries.

## Installation

### Quick Install

```bash
git clone https://github.com/JackXu19930319/claude-memory-hooks.git
cd claude-memory-hooks
node install.mjs --project /path/to/your/project
```

The installer will:
1. Copy hook scripts to `<project>/.claude/hooks/`
2. Create `corrections.md` and `learned_rules.md` in your memory directory
3. Add hook configuration to `<project>/.claude/settings.json`

### Manual Install

1. Copy the three `.mjs` files from `hooks/` into `<your-project>/.claude/hooks/`

2. Add to your project's `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{
          "type": "command",
          "command": "node \"<project>/.claude/hooks/track-corrections.mjs\"",
          "timeout": 10
        }]
      }
    ],
    "Stop": [
      {
        "hooks": [{
          "type": "command",
          "command": "node \"<project>/.claude/hooks/session-reflection.mjs\"",
          "timeout": 10
        }]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{
          "type": "command",
          "command": "node \"<project>/.claude/hooks/dedup-check.mjs\"",
          "timeout": 5
        }]
      }
    ]
  }
}
```

3. Create `corrections.md` and `learned_rules.md` in your memory directory (see `templates/`)

4. Add the Self-Correction Protocol and Memory Dedup Protocol sections to your MEMORY.md (see installer output for the text)

## How It Works

```
Session starts
  └─ Claude checks learned_rules.md for past lessons

During conversation
  └─ PostToolUse hook tracks all Edit/Write operations
  └─ Same file edited 2+ times → logged to corrections.md
  └─ PreToolUse hook blocks duplicate writes to memory files

User corrects Claude
  └─ Claude self-logs the correction (via MEMORY.md instructions)
  └─ Format: date + category + what went wrong + rule

Session ends
  └─ Stop hook reads corrections.md
  └─ Groups by category tag
  └─ 2+ same-category corrections → synthesize rule → write to learned_rules.md
```

## File Structure

```
<project>/.claude/
  settings.json          # Hook configuration
  hooks/
    track-corrections.mjs    # PostToolUse: correction tracking
    session-reflection.mjs   # Stop: auto reflection
    dedup-check.mjs          # PreToolUse: write dedup
    .edit-tracker.json       # Runtime state (auto-created)

~/.claude/projects/<hash>/memory/
  corrections.md         # Correction log
  learned_rules.md       # Synthesized rules
```

## Requirements

- Node.js 18+
- Claude Code CLI

## Inspired By

This project draws ideas from:
- [claude-memory-engine](https://github.com/HelloRuru/claude-memory-engine) — Correction cycle concept
- [claude-diary](https://github.com/rlancemartin/claude-diary) — Reflection and pattern synthesis
- [SimpleMem](https://github.com/aiming-lab/SimpleMem) — Write-time deduplication
- [claude-mem](https://github.com/thedotmack/claude-mem) — 3-layer memory retrieval

## License

MIT

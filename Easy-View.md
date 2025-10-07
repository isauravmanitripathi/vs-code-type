# JSON Project Builder

A VS Code extension to automate project creation and interactive coding tutorials from JSON "blueprints". It creates files/folders, types code, highlights sections, and adds AI voiceovers for step-by-step demos.

## Quick Start

1. **Install**: Search "JSON Project Builder" in VS Code Extensions and install.
2. **Run**: Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`), type "JSON Project Builder: Build from JSON", select a `.json` blueprint file (or folder of them).
3. **Requirements**: Open a VS Code workspace. Voiceovers use Azure Speech (needs config; disable via `enableVoiceover: false` for testing).

## Blueprint Structure

Every blueprint is a JSON file like this:

```json
{
  "rootFolder": "my-project",  // Required: Base folder to create
  "globalTypingSpeed": 35,     // Optional: ms per char (default: 50)
  "actionDelay": 1000,         // Optional: ms between actions (default: 800)
  "defaultVoice": "en-US-AndrewNeural",  // Optional: TTS voice (default: "en-US-AriaNeural")
  "enableVoiceover": true,     // Optional: Enable narration (default: true)
  "actions": [                 // Array of actions (required)
    // Actions here
  ]
}
```

- Paths are relative to `rootFolder`.
- Actions run sequentially; use delays for pacing.
- Test without voice: Set `"enableVoiceover": false`.

## Action Types

Each action has a `type` and optional properties. All support `voiceover` (narration text) and `voiceoverTiming` (`"before"`: speak then act; `"during"`: concurrent; `"after"`: act then speak; default: `"before"`). Use `typingSpeed` (ms/char) to override global.

| Type | What It Does | Required Properties | Optional Properties | Example | Tips & Incompatibilities |
|-----|--------------|---------------------|---------------------|---------|-------------------------|
| **createFolder** | Creates a folder (reveals in Explorer). | `path` (e.g., "src/utils") | `voiceover`, `voiceoverTiming` | `{"type": "createFolder", "path": "src"}` | Create parents first (e.g., "src" before "src/utils"). No content. |
| **createFile** | Creates an empty file (reveals in Explorer; auto-creates parents). | `path` (e.g., "src/main.py") | `voiceover`, `voiceoverTiming` | `{"type": "createFile", "path": "index.js"}` | Extension sets syntax highlighting. Create before opening. |
| **openFile** | Opens file in editor (becomes active). | `path` | `voiceover`, `voiceoverTiming` | `{"type": "openFile", "path": "index.js"}` | File must exist. Use before `writeText`/`insert`. |
| **writeText** | Types text at cursor (char-by-char; auto-formats after). | `content` (use `\n` for lines) | `voiceover`, `voiceoverTiming`, `typingSpeed` | `{"type": "writeText", "content": "console.log('Hi');\n"}` | Appends to cursor—use after `openFile`. Write complete blocks. No positioning (use `insert` for that). |
| **insert** | Inserts text relative to a spot (auto-indents; adds newline if needed). | `content`; one of: `after`/`before` (pattern), `at` (line #, 0-based) | `near`/`inside` (context), `occurrence` (# match, 1-based), `voiceover`, `voiceoverTiming`, `typingSpeed` | `{"type": "insert", "after": "import React", "content": "import {useState}\n"}` | Patterns fuzzy (ignores whitespace). Use `near` if ambiguous. Content: relative indent. Not for absolute start. |
| **delete** | Finds & deletes pattern (selects first, 500ms view, auto-formats). | `find` (pattern) | `near`/`inside`/`occurrence`, `voiceover`, `voiceoverTiming` | `{"type": "delete", "find": "console.log('debug')"}` | First match only. Specific patterns to avoid wrong deletes. No replacement (use `replace`). |
| **replace** | Finds pattern, deletes (800ms view), types new text (auto-formats). | `find`, `with` (new text) | `near`/`inside`/`occurrence`, `voiceover`, `voiceoverTiming`, `typingSpeed` | `{"type": "replace", "find": "let x=1", "with": "const x=1"}` | First match. Good for refactors. Types `with`—keep short. |
| **highlight** | Opens file, highlights line with pattern (yellow bg/border, min 1s; clears after). | `path`, `find` | `near`/`inside`/`occurrence`, `voiceover`, `voiceoverTiming`, `voice` (voice override), `moveCursor` (post-position: "endOfFile", "newLineAfter", "newLineBefore", "sameLine", "stay", "nextBlankLine") | `{"type": "highlight", "path": "main.py", "find": "print('Hi')", "voiceover": "This prints hello.", "voiceoverTiming": "during", "moveCursor": "endOfFile"}` | Use `"during"` to sync with voice (highlight stays till done). Patterns fuzzy. Always set `moveCursor` if next action types. Highlights whole line. |

- **Pattern Matching (for insert/delete/replace/highlight)**: Substring search (ignores leading/trailing space). Filters by `near` (20-line window). Defaults to first match; `occurrence: 2` for second.
- **Voice**: Overrides default (e.g., `"voice": "en-US-GuyNeural"`). All actions share `voiceover` props.
- **Incompatibilities**: No `moveCursor` except on `highlight`. Don't mix `after`/`before`/`at` in one `insert`. Patterns must exist (error if not found). No regex—use exact-ish strings.

## Best Practices

- **Order**: Folders > files > open > write/insert > highlight/delete/replace.
- **Pacing**: Slower typing (50+ ms) for beginners; add `\n\n` before sections in `content`.
- **Indent**: Extension auto-detects (spaces/tabs from VS Code config). Use relative indents in `content` (e.g., 4 spaces for blocks).
- **Voiceovers**: Keep short (1-2 sentences). Test with `enableVoiceover: false`.
- **Testing**: Run one action at a time; check console for errors.
- **Files**: Use forward slashes (`/`). Multi-blueprint folder: Processes alphabetically.

## Common Pitfalls & Fixes

- **Pattern Not Found**: Make specific; add `near: "function name"`.
- **Wrong Cursor**: Set `moveCursor: "endOfFile"` on highlights before typing.
- **Bad Indent**: Provide relative spaces in `content`; auto-format runs after edits.
- **Highlight Too Quick**: Use `"voiceoverTiming": "during"`.
- **File Not Open**: Always `openFile` before `writeText`/`insert`.

## Full Example Blueprint

```json
{
  "rootFolder": "hello-world",
  "globalTypingSpeed": 40,
  "actionDelay": 1200,
  "defaultVoice": "en-US-AndrewNeural",
  "enableVoiceover": true,
  "actions": [
    {"type": "createFolder", "path": "src", "voiceover": "Create source folder."},
    {"type": "createFile", "path": "src/app.js"},
    {"type": "openFile", "path": "src/app.js"},
    {"type": "writeText", "content": "console.log('Hello');\n"},
    {"type": "highlight", "path": "src/app.js", "find": "console.log", "voiceover": "This logs to console.", "voiceoverTiming": "during", "moveCursor": "newLineAfter"},
    {"type": "insert", "after": "console.log", "content": "alert('World');\n", "voiceover": "Add alert."}
  ]
}
```

For advanced use (e.g., multi-occurrence), see full docs in extension repo. Questions? File an issue!
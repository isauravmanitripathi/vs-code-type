# JSON Project Builder - Blueprint Guide

A VS Code extension that automates coding tutorials by "playing back" JSON blueprints. Create folders, files, type code character-by-character, insert/edit code at specific locations, and optionally add voiceover narration.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Blueprint Structure](#blueprint-structure)
3. [Action Types](#action-types)
4. [Smart Insert Logic](#smart-insert-logic)
5. [Pattern Matching Rules](#pattern-matching-rules)
6. [Highlighting](#highlighting)
7. [Voiceover System](#voiceover-system)
8. [Best Practices](#best-practices)
9. [Troubleshooting](#troubleshooting)

---

## Quick Start

1. Create a JSON file with your blueprint
2. Open VS Code with a workspace folder
3. Run command: `JSON Project Builder: Build From JSON`
4. Select your JSON file

**Minimal Example:**
```json
{
  "rootFolder": "my-project",
  "actions": [
    { "type": "createFile", "path": "index.js" },
    { "type": "openFile", "path": "index.js" },
    { "type": "writeText", "content": "console.log('Hello!');" }
  ]
}
```

---

## Blueprint Structure

### Root Properties

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `rootFolder` | string | ✅ | - | Name of the project folder (created in workspace) |
| `actions` | array | ✅ | - | Ordered list of actions to execute |
| `globalTypingSpeed` | number | ❌ | 50 | Milliseconds per character when typing |
| `actionDelay` | number | ❌ | 800 | Pause (ms) between actions |
| `enableVoiceover` | boolean | ❌ | true | Enable/disable text-to-speech |
| `defaultVoice` | string | ❌ | "en-US-AriaNeural" | Default TTS voice |

---

## Action Types

### 1. `createFolder`
Creates a directory (including parent directories if needed).

```json
{
  "type": "createFolder",
  "path": "src/components"
}
```

### 2. `createFile`
Creates an empty file (and parent directories if needed).

```json
{
  "type": "createFile",
  "path": "src/index.js"
}
```

### 3. `openFile`
Opens a file in the editor. **Required before `writeText` or `insert`.**

```json
{
  "type": "openFile",
  "path": "src/index.js"
}
```

### 4. `writeText`
Types content character-by-character at the current cursor position.

```json
{
  "type": "writeText",
  "content": "function hello() {\n    console.log('Hi!');\n}",
  "typingSpeed": 30
}
```

### 5. `insert`
Inserts code at a specific location. Use ONE of: `after`, `before`, or `at`.

**Insert AFTER a pattern:**
```json
{
  "type": "insert",
  "after": "class MyClass {",
  "content": "    constructor() {\n        this.value = 0;\n    }"
}
```

**Insert BEFORE a pattern:**
```json
{
  "type": "insert",
  "before": "export default",
  "content": "// Helper function\nfunction helper() {}\n"
}
```

**Insert AT a specific line number:**
```json
{
  "type": "insert",
  "at": 0,
  "content": "// File header comment"
}
```

### 6. `delete`
Removes text matching a pattern.

```json
{
  "type": "delete",
  "find": "console.log('debug');"
}
```

### 7. `replace`
Finds text and replaces it with new content.

```json
{
  "type": "replace",
  "find": "TODO: implement",
  "with": "return this.value * 2;"
}
```

### 8. `highlight`
Highlights a line and optionally plays voiceover. Does NOT open the file automatically - use with `path` to open.

```json
{
  "type": "highlight",
  "path": "src/index.js",
  "find": "constructor()",
  "voiceover": "This is the constructor method."
}
```

### 9. `openTerminal`
Opens or creates a named terminal.

```json
{
  "type": "openTerminal",
  "terminalName": "Build",
  "cwd": "src"
}
```

| Property | Required | Description |
|----------|----------|-------------|
| `terminalName` | ❌ | Name of terminal (default: "Build") |
| `cwd` | ❌ | Working directory (relative to rootFolder) |

### 10. `runCommand`
Executes a command in the terminal and waits for completion.

```json
{
  "type": "runCommand",
  "terminalName": "Build",
  "command": "npm install",
  "waitForCompletion": true,
  "timeout": 60000
}
```

| Property | Required | Description |
|----------|----------|-------------|
| `command` | ✅ | Command to execute |
| `terminalName` | ❌ | Which terminal to use (default: "Build") |
| `waitForCompletion` | ❌ | Wait for command to finish (default: true) |
| `timeout` | ❌ | Timeout in ms (default: 120000) |

### 11. `showTerminal`
Shows/focuses a terminal.

```json
{ "type": "showTerminal", "terminalName": "Build" }
```

### 12. `hideTerminal`
Hides terminal and returns focus to the editor.

```json
{ "type": "hideTerminal" }
```

### 13. `closeTerminal`
Closes and disposes a terminal.

```json
{ "type": "closeTerminal", "terminalName": "Build" }
```

---

## Smart Insert Logic

### Block-End Detection (Python/JS)

When you insert `after` a line that **opens a code block**, the extension automatically finds where the block ends:

**Python Example:**
```json
{
  "type": "insert",
  "after": "def get_data(self):",
  "content": "def process_data(self):\n    pass"
}
```
The extension detects `:` at the end → scans for dedent → inserts AFTER the entire `get_data` function.

**JavaScript Example:**
```json
{
  "type": "insert",
  "after": "function calculate() {",
  "content": "function helper() {\n    return true;\n}"
}
```
The extension counts braces `{}` → finds the closing `}` → inserts after it.

### Indentation

- Content is automatically normalized to match the target location's indentation
- Your JSON content can have any indentation - it will be adjusted
- The extension respects VS Code's tab/space settings

---

## Pattern Matching Rules

### Basic Matching
Patterns are matched by **trimmed line content**. Leading/trailing whitespace is ignored.

```json
"after": "class App {"
```
Matches: `    class App {` or `class App {`

### Disambiguation with `near`
When a pattern appears multiple times, use `near` to specify context:

```json
{
  "type": "insert",
  "after": "return true;",
  "near": "function validate",
  "content": "// Validation passed"
}
```
The extension searches ±20 lines around the match for the `near` pattern.

### Explicit Occurrence
Use `occurrence` to select which match (1-indexed):

```json
{
  "type": "insert",
  "after": "console.log",
  "occurrence": 2,
  "content": "// Second log statement"
}
```

---

## Highlighting

### Auto-Highlight on Insert/Write
Add `highlight: true` to automatically flash-highlight the newly added code:

```json
{
  "type": "writeText",
  "content": "const API_KEY = 'abc123';",
  "highlight": true,
  "voiceover": "Here we define our API key."
}
```

### Dedicated Highlight Action
For highlighting existing code without modifying it:

```json
{
  "type": "highlight",
  "path": "src/config.js",
  "find": "API_KEY",
  "voiceover": "This constant stores our API key.",
  "moveCursor": "endOfFile"
}
```

### Cursor Movement After Highlight

| Value | Behavior |
|-------|----------|
| `stay` | Don't move cursor |
| `sameLine` | Move to end of highlighted line |
| `endOfFile` | Move to last line of file |
| `newLineAfter` | Insert blank line after and move there |
| `newLineBefore` | Insert blank line before and move there |
| `nextBlankLine` | Find next blank line and move there |

---

## Voiceover System

### Adding Voiceover
Any action can have a voiceover:

```json
{
  "type": "createFile",
  "path": "src/app.js",
  "voiceover": "Let's create our main application file."
}
```

### Timing Options

| Value | Behavior |
|-------|----------|
| `before` | Play audio, then execute action (default) |
| `during` | Start audio, execute action simultaneously |
| `after` | Execute action, then play audio |

```json
{
  "type": "writeText",
  "content": "...",
  "voiceover": "Watch as we type this code...",
  "voiceoverTiming": "during"
}
```

### Voice Selection
Override the default voice per-action:

```json
{
  "voiceover": "Important note!",
  "voice": "en-US-GuyNeural"
}
```

---

## Best Practices

### 1. Always Open Before Writing
```json
{ "type": "createFile", "path": "app.js" },
{ "type": "openFile", "path": "app.js" },
{ "type": "writeText", "content": "..." }
```

### 2. Use Unique Patterns
Avoid generic patterns like `return` or `}`. Be specific:
```json
"after": "return this.processData();"
```

### 3. Build Incrementally
Write base structure first, then insert additions:
```json
// First: Write class skeleton
{ "type": "writeText", "content": "class App {\n}\n" },
// Then: Insert methods
{ "type": "insert", "after": "class App {", "content": "..." }
```

### 4. Leverage Auto-Highlight
Use `highlight: true` on important code to draw attention:
```json
{
  "type": "insert",
  "after": "...",
  "content": "// Critical security check\nif (!isValid) throw new Error();",
  "highlight": true
}
```

### 5. Group Related Actions
Keep related operations together for logical flow:
```json
// Create and populate config file
{ "type": "createFile", "path": "config.js" },
{ "type": "openFile", "path": "config.js" },
{ "type": "writeText", "content": "module.exports = { ... }" },
// Now create main file that uses config
{ "type": "createFile", "path": "index.js" },
...
```

---

## Troubleshooting

### "Pattern not found" Error
- Check for typos in your pattern
- Use `near` to disambiguate
- Verify previous actions executed correctly

### Code Inserted in Wrong Location
- If inserting after a block opener (`:` or `{`), the extension auto-detects block end
- Use `before` instead of `after` if needed
- Use `at` for absolute line positioning

### Highlight Covers Wrong Lines
- Ensure your `content` string accurately reflects what you're typing
- The extension counts lines in your content to determine highlight range

### Cursor Not Where Expected
- Use `moveCursor` on highlight actions to control positioning
- Each `insert` leaves cursor at end of inserted content

---

## Example: Full Python Project

```json
{
  "rootFolder": "calculator",
  "globalTypingSpeed": 35,
  "enableVoiceover": true,
  "actions": [
    {
      "type": "createFile",
      "path": "calc.py",
      "voiceover": "Creating our calculator module."
    },
    {
      "type": "openFile",
      "path": "calc.py"
    },
    {
      "type": "writeText",
      "content": "class Calculator:\n    def __init__(self):\n        self.result = 0\n\n    def add(self, x):\n        self.result += x\n        return self",
      "highlight": true,
      "voiceover": "We start with a basic Calculator class."
    },
    {
      "type": "insert",
      "after": "def add(self, x):",
      "content": "\n    def subtract(self, x):\n        self.result -= x\n        return self",
      "highlight": true,
      "voiceover": "Now adding a subtract method after the add method."
    },
    {
      "type": "createFile",
      "path": "main.py"
    },
    {
      "type": "openFile",
      "path": "main.py"
    },
    {
      "type": "writeText",
      "content": "from calc import Calculator\n\nc = Calculator()\nc.add(5).subtract(2)\nprint(c.result)",
      "highlight": true,
      "voiceover": "Finally, we use our calculator with method chaining."
    }
  ]
}
```

---

## Support

For issues or feature requests, check the extension's repository or open an issue.

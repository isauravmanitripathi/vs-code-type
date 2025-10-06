# JSON Blueprint Quick Guide

## Basic Structure

```json
{
  "rootFolder": "my-project",
  "globalTypingSpeed": 35,
  "actionDelay": 1200,
  "defaultVoice": "en-US-AndrewMultilingualNeural",
  "enableVoiceover": true,
  "actions": [...]
}
```

**Settings:**
- `globalTypingSpeed`: 25-40 (milliseconds per character)
- `actionDelay`: 800-1500 (pause between actions in ms)
- `enableVoiceover`: true/false for narration

---

## Action Types

### 1. Create & Open Files

```json
{"type": "createFolder", "path": "src/components"},
{"type": "createFile", "path": "src/index.js"},
{"type": "openFile", "path": "src/index.js"}
```

### 2. Write Text

Writes at current cursor position. Always write complete, working code blocks.

```json
{
  "type": "writeText",
  "content": "function hello() {\n  console.log('Hi');\n}\n",
  "voiceover": "Creating a simple function",
  "voiceoverTiming": "during"
}
```

### 3. Insert Code

Insert at specific locations using pattern matching.

```json
{
  "type": "insert",
  "after": "import React from 'react';",
  "content": "import { useState } from 'react';\n",
  "near": "optional context for finding pattern",
  "occurrence": 1
}
```

Use `after`, `before`, or `at: lineNumber` to specify location.

### 4. Highlight & Explain

```json
{
  "type": "highlight",
  "path": "src/index.js",
  "find": "useState(0)",
  "voiceover": "Notice how we initialize state here",
  "voiceoverTiming": "during",
  "moveCursor": "endOfFile"
}
```

**Important:** Always specify `moveCursor` to control what happens after highlighting:
- `"endOfFile"` - Move to end of file
- `"newLineAfter"` - Add line after highlight
- `"sameLine"` - Stay on highlighted line
- `"stay"` - Don't move cursor

### 5. Delete & Replace

```json
{"type": "delete", "find": "console.log('debug');"},

{
  "type": "replace",
  "find": "let x = 5;",
  "with": "const x = 10;"
}
```

---

## Voiceover Timing

- `"before"`: Speak, then execute action
- `"during"`: Speak while action runs (typing/highlighting)
- `"after"`: Execute, then speak

---

## Best Practices

**1. Write complete code blocks**
```json
// GOOD - complete function
{"content": "function add(a, b) {\n  return a + b;\n}\n"}

// BAD - incomplete code
{"content": "function add(a, b) {\n"}
```

**2. Add spacing BEFORE sections**
```json
{"content": "\n\n// New section\nfunction next() {}\n"}
```

**3. Use specific patterns for finding**
```json
// GOOD - unique pattern
{"find": "class UserService {"}

// BAD - too generic
{"find": "{"}
```

**4. Use `near` for disambiguation**
```json
{
  "find": "return result;",
  "near": "calculateTotal function"
}
```

**5. Always control cursor after highlights**
```json
{
  "type": "highlight",
  "find": "something",
  "moveCursor": "endOfFile"  // Always specify this
}
```

---

## Quick Example

```json
{
  "rootFolder": "hello-world",
  "globalTypingSpeed": 35,
  "actionDelay": 1000,
  "actions": [
    {
      "type": "createFile",
      "path": "app.js",
      "voiceover": "Creating our application file",
      "voiceoverTiming": "before"
    },
    {
      "type": "openFile",
      "path": "app.js"
    },
    {
      "type": "writeText",
      "content": "// Hello World App\n\nfunction greet(name) {\n  return `Hello, ${name}!`;\n}\n\nconsole.log(greet('World'));\n",
      "voiceover": "Writing a simple greeting function",
      "voiceoverTiming": "during"
    },
    {
      "type": "highlight",
      "path": "app.js",
      "find": "return `Hello, ${name}!`;",
      "voiceover": "Notice how we use template literals for string interpolation",
      "voiceoverTiming": "during",
      "moveCursor": "endOfFile"
    }
  ]
}
```

---

## Common Issues

**Pattern not found?** Use more specific patterns or add `near` context.

**Wrong cursor position?** Always set `moveCursor` on highlight actions.

**Multiple matches?** Use `occurrence: 2` to select the second match.
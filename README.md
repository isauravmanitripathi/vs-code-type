# Complete Guide to Creating JSON Blueprints for VS Code Tutorial Extension

## Table of Contents
1. [Core Concepts](#core-concepts)
2. [Global Settings](#global-settings)
3. [Action Types Reference](#action-types-reference)
4. [Best Practices](#best-practices)
5. [Common Patterns](#common-patterns)
6. [Troubleshooting](#troubleshooting)

---

## Core Concepts

### What is a Blueprint?
A blueprint is a JSON file that defines a step-by-step tutorial. Each action in the blueprint creates files, types code, highlights sections, and plays voiceovers to create an animated coding tutorial.

### Structure Overview
```json
{
  "rootFolder": "project-name",
  "globalTypingSpeed": 35,
  "actionDelay": 1200,
  "defaultVoice": "en-US-AndrewMultilingualNeural",
  "enableVoiceover": true,
  "actions": [...]
}
```

---

## Global Settings

### `rootFolder` (required)
**Type:** String  
**Purpose:** Name of the folder where the project will be created  
**Example:** `"rootFolder": "my-tutorial-project"`

### `globalTypingSpeed` (optional)
**Type:** Number (milliseconds per character)  
**Default:** 50  
**Purpose:** How fast text is typed character-by-character  
**Recommendations:**
- 25-30: Very fast (for experienced viewers)
- 35-40: Comfortable pace (recommended)
- 50-70: Slower pace (for beginners)

### `actionDelay` (optional)
**Type:** Number (milliseconds)  
**Default:** 800  
**Purpose:** Pause between each action  
**Recommendations:**
- 800-1000: Quick transitions
- 1200-1500: Comfortable viewing pace (recommended)
- 2000+: Slower, more deliberate

### `defaultVoice` (optional)
**Type:** String  
**Default:** "en-US-AriaNeural"  
**Purpose:** Azure Speech Service voice for all voiceovers  
**Common Options:**
- "en-US-AndrewMultilingualNeural" (male, clear)
- "en-US-AriaNeural" (female, clear)
- "en-US-GuyNeural" (male, conversational)

### `enableVoiceover` (optional)
**Type:** Boolean  
**Default:** true  
**Purpose:** Enable/disable all voiceovers globally

---

## Action Types Reference

### 1. `createFolder`

Creates a directory in the project.

```json
{
  "type": "createFolder",
  "path": "src/components",
  "voiceover": "First, let's create our components folder.",
  "voiceoverTiming": "before"
}
```

**Properties:**
- `path` (required): Relative path from rootFolder
- `voiceover` (optional): Text to speak
- `voiceoverTiming` (optional): "before" | "during" | "after"

**Best Practices:**
- Create parent folders before child folders
- Use forward slashes `/` for paths (cross-platform compatible)

---

### 2. `createFile`

Creates an empty file.

```json
{
  "type": "createFile",
  "path": "src/index.js",
  "voiceover": "Now we'll create the main entry point.",
  "voiceoverTiming": "before"
}
```

**Properties:**
- `path` (required): Relative file path from rootFolder
- `voiceover` (optional): Text to speak
- `voiceoverTiming` (optional): "before" | "during" | "after"

**Best Practices:**
- File extension determines syntax highlighting
- Parent directories are created automatically if they don't exist
- Always create the file before trying to open it

---

### 3. `openFile`

Opens a file in the editor.

```json
{
  "type": "openFile",
  "path": "src/index.js",
  "voiceover": "Let's open our main file and start coding.",
  "voiceoverTiming": "before"
}
```

**Properties:**
- `path` (required): File to open
- `voiceover` (optional): Text to speak
- `voiceoverTiming` (optional): "before" | "during" | "after"

**Best Practices:**
- File must exist before opening
- Opening a file makes it the active editor for subsequent actions

---

### 4. `writeText`

Types text character-by-character at the current cursor position.

```json
{
  "type": "writeText",
  "content": "import React from 'react';\n\n",
  "voiceover": "We start by importing React at the top of our file.",
  "voiceoverTiming": "during",
  "typingSpeed": 30
}
```

**Properties:**
- `content` (required): Text to type (use `\n` for newlines)
- `voiceover` (optional): Text to speak
- `voiceoverTiming` (optional): "before" | "during" | "after"
- `typingSpeed` (optional): Override global typing speed

**Critical Best Practices:**

**DO write complete logical blocks:**
```json
{
  "type": "writeText",
  "content": "function calculateSum(a, b) {\n    return a + b;\n}\n"
}
```

**DON'T write incomplete fragments:**
```json
// WRONG - leaves code broken
{
  "type": "writeText",
  "content": "function calculateSum(a, b) {\n"
}
```

**Handle spacing properly:**
```json
// Add spacing BEFORE sections
{
  "type": "writeText",
  "content": "\n\n// Helper functions\n"
}

// NOT after, which leaves cursor in awkward position
{
  "type": "writeText",
  "content": "// Helper functions\n\n\n"
}
```

**Use escape sequences:**
- `\n` for newlines
- `\t` for tabs (though spaces are recommended)
- `\"` for quotes inside strings

---

### 5. `insert`

Inserts code at a specific location using pattern matching.

**Insert After Pattern:**
```json
{
  "type": "insert",
  "after": "import React from 'react';",
  "content": "import { useState } from 'react';\n",
  "voiceover": "Now let's add the useState hook import.",
  "voiceoverTiming": "during",
  "typingSpeed": 30
}
```

**Insert Before Pattern:**
```json
{
  "type": "insert",
  "before": "export default App;",
  "content": "\nconsole.log('App initialized');\n",
  "near": "App component"
}
```

**Insert At Line Number:**
```json
{
  "type": "insert",
  "at": 10,
  "content": "// TODO: Add error handling\n"
}
```

**Properties:**
- `after` | `before` | `at` (one required): Location selector
- `content` (required): Text to insert
- `near` (optional): Context hint for disambiguation
- `inside` (optional): Section context
- `occurrence` (optional): Which match (1-indexed, default: 1)
- `voiceover` (optional): Text to speak
- `voiceoverTiming` (optional): "before" | "during" | "after"
- `typingSpeed` (optional): Override global speed

**Best Practices:**

**Use patterns that are unique:**
```json
// GOOD - unique pattern
"after": "class UserService {"

// BAD - too generic, might match multiple places
"after": "{"
```

**Use `near` for disambiguation:**
```json
{
  "after": "return data;",
  "near": "fetchUser function",
  "content": "// Cache the result\n"
}
```

**Include proper indentation context:**
The extension automatically detects and applies indentation, but your content should have relative indentation:
```json
{
  "after": "if (isValid) {",
  "content": "    console.log('Valid input');\n    processData();\n"
}
```

---

### 6. `highlight`

Visually highlights code and optionally explains it with voiceover.

```json
{
  "type": "highlight",
  "path": "src/index.js",
  "find": "useState(0)",
  "voiceover": "Notice how we initialize the state with zero. The highlight stays visible while I explain this concept.",
  "voiceoverTiming": "during",
  "moveCursor": "endOfFile",
  "near": "Counter component",
  "occurrence": 1
}
```

**Properties:**
- `path` (required): File to highlight in
- `find` (required): Pattern to highlight
- `voiceover` (optional but recommended): Explanation
- `voiceoverTiming` (optional): "before" | "during" | "after"
- `moveCursor` (optional): Where to move cursor after highlight
- `near` (optional): Context for finding pattern
- `inside` (optional): Section context
- `occurrence` (optional): Which match (1-indexed)

**Cursor Movement Options:**
- `"endOfFile"`: Move to end of document (default smart behavior)
- `"newLineAfter"`: Insert newline after highlighted line, move cursor there
- `"newLineBefore"`: Insert newline before highlighted line
- `"sameLine"`: Stay at end of highlighted line
- `"stay"`: Don't move cursor at all
- `"nextBlankLine"`: Find next empty line

**Critical Highlight Best Practices:**

**Always specify `voiceoverTiming` for highlights:**
```json
// CORRECT - highlight stays until voiceover finishes
{
  "type": "highlight",
  "find": "for loop",
  "voiceover": "This loop iterates...",
  "voiceoverTiming": "during"  // REQUIRED
}

// WRONG - might disappear too quickly
{
  "type": "highlight",
  "find": "for loop",
  "voiceover": "This loop iterates..."
  // Missing voiceoverTiming
}
```

**Always specify `moveCursor` to prevent conflicts:**
```json
// CORRECT - explicit cursor control
{
  "type": "highlight",
  "find": "function declaration",
  "voiceover": "Notice the function signature...",
  "voiceoverTiming": "during",
  "moveCursor": "endOfFile"  // Cursor moves away
}

// If you want to continue typing right after highlight:
{
  "type": "highlight",
  "find": "const x = 5;",
  "voiceover": "We initialize x here...",
  "voiceoverTiming": "during",
  "moveCursor": "newLineAfter"  // Ready to type on next line
}
```

**Use specific patterns:**
```json
// GOOD - specific enough to find
"find": "const [count, setCount] = useState(0);"

// BAD - too vague, might match wrong line
"find": "useState"
```

**Use `near` for complex files:**
```json
{
  "find": "return",
  "near": "handleSubmit function",  // Disambiguates which return statement
  "occurrence": 1
}
```

---

### 7. `delete`

Removes text matching a pattern.

```json
{
  "type": "delete",
  "find": "console.log('debug');",
  "voiceover": "Let's remove this debug statement.",
  "voiceoverTiming": "before"
}
```

**Properties:**
- `find` (required): Pattern to delete
- `voiceover` (optional): Text to speak
- `voiceoverTiming` (optional): "before" | "during" | "after"

**Best Practices:**
- Use specific patterns to avoid deleting wrong code
- Shows selection briefly before deleting (500ms)
- Automatically formats code after deletion

---

### 8. `replace`

Replaces text matching a pattern with new text.

```json
{
  "type": "replace",
  "find": "const API_URL = 'localhost:3000';",
  "with": "const API_URL = 'https://api.production.com';",
  "voiceover": "Now let's update the API URL for production.",
  "voiceoverTiming": "before",
  "typingSpeed": 25
}
```

**Properties:**
- `find` (required): Pattern to replace
- `with` (required): Replacement text
- `voiceover` (optional): Text to speak
- `voiceoverTiming` (optional): "before" | "during" | "after"
- `typingSpeed` (optional): Speed for typing replacement

**Best Practices:**
- Replacement text is typed character-by-character
- Shows selection for 800ms before replacing
- Use for demonstrating refactoring or configuration changes

---

## Best Practices

### 1. Building Code Incrementally

**DO: Write complete, working sections**
```json
{
  "type": "writeText",
  "content": "class Calculator {\n    constructor() {\n        this.result = 0;\n    }\n}\n"
}
```

**DON'T: Leave code incomplete between actions**
```json
// WRONG - leaves broken code
{
  "type": "writeText",
  "content": "class Calculator {\n"
},
{
  "type": "highlight",
  "find": "something else"
},
{
  "type": "writeText",
  "content": "    constructor() {\n"
}
```

### 2. Spacing Strategy

**Add spacing BEFORE new sections:**
```json
{
  "type": "writeText",
  "content": "function first() {}\n"
},
{
  "type": "writeText",
  "content": "\n\n// Second function\nfunction second() {}\n"
}
```

**NOT after (leaves cursor hanging):**
```json
// WRONG
{
  "type": "writeText",
  "content": "function first() {}\n\n\n"
},
{
  "type": "writeText",
  "content": "// Second function\n"
}
```

### 3. Voiceover Timing

**"before"**: For introductions and setup actions
```json
{
  "type": "createFile",
  "voiceoverTiming": "before",  // Speak, then create
  "voiceover": "Let's create a new component file."
}
```

**"during"**: For concurrent actions (typing, highlighting)
```json
{
  "type": "writeText",
  "voiceoverTiming": "during",  // Speak while typing
  "voiceover": "We import React and set up our component."
}
```

**"after"**: For explanations after completion
```json
{
  "type": "openFile",
  "voiceoverTiming": "after",  // Open, then speak
  "voiceover": "Now we have our file open and ready."
}
```

### 4. Pattern Matching Tips

**Fuzzy matching ignores whitespace:**
```json
// These all match the same line:
"find": "function example() {"
"find": "function example(){"
"find": "function   example  (  )   {"
```

**Use `near` for disambiguation:**
```json
{
  "find": "return result;",
  "near": "calculate function",  // Finds return in calculate()
  "occurrence": 1
}
```

**Use `occurrence` for multiple matches:**
```json
{
  "find": "console.log",
  "occurrence": 2  // Finds the second console.log
}
```

### 5. File Organization

**Create files in logical order:**
```json
{
  "actions": [
    {"type": "createFolder", "path": "src"},
    {"type": "createFolder", "path": "src/components"},
    {"type": "createFile", "path": "src/index.js"},
    {"type": "createFile", "path": "src/components/App.js"}
  ]
}
```

### 6. Typing Speed Variations

Use different speeds for emphasis:
```json
{
  "type": "writeText",
  "content": "// This is important!\n",
  "typingSpeed": 50  // Slower for emphasis
},
{
  "type": "writeText",
  "content": "const boilerplate = {};\n",
  "typingSpeed": 20  // Faster for boring code
}
```

---

## Common Patterns

### Pattern 1: File Creation Workflow

```json
{
  "actions": [
    {
      "type": "createFile",
      "path": "app.js",
      "voiceover": "Creating our main application file.",
      "voiceoverTiming": "before"
    },
    {
      "type": "openFile",
      "path": "app.js",
      "voiceover": "Opening the file to start coding.",
      "voiceoverTiming": "before"
    },
    {
      "type": "writeText",
      "content": "// Application entry point\n",
      "voiceover": "Adding a descriptive comment.",
      "voiceoverTiming": "during"
    }
  ]
}
```

### Pattern 2: Explain Then Code

```json
{
  "actions": [
    {
      "type": "writeText",
      "content": "\n// Step 1: Initialize variables\n",
      "voiceover": "First, we need to set up our initial variables.",
      "voiceoverTiming": "before"
    },
    {
      "type": "writeText",
      "content": "let counter = 0;\nlet total = 0;\n",
      "voiceover": "We create a counter and a total accumulator.",
      "voiceoverTiming": "during"
    }
  ]
}
```

### Pattern 3: Highlight and Explain Multiple Lines

```json
{
  "actions": [
    {
      "type": "writeText",
      "content": "function processData(input) {\n    const validated = validate(input);\n    const transformed = transform(validated);\n    return save(transformed);\n}\n"
    },
    {
      "type": "highlight",
      "find": "const validated = validate(input);",
      "voiceover": "First, we validate the input data.",
      "voiceoverTiming": "during",
      "moveCursor": "endOfFile"
    },
    {
      "type": "highlight",
      "find": "const transformed = transform(validated);",
      "voiceover": "Then we transform it to our desired format.",
      "voiceoverTiming": "during",
      "moveCursor": "endOfFile"
    },
    {
      "type": "highlight",
      "find": "return save(transformed);",
      "voiceover": "Finally, we save the processed data.",
      "voiceoverTiming": "during",
      "moveCursor": "endOfFile"
    }
  ]
}
```

### Pattern 4: Refactoring Demo

```json
{
  "actions": [
    {
      "type": "writeText",
      "content": "const result = data.filter(x => x.active).map(x => x.value);\n"
    },
    {
      "type": "highlight",
      "find": "const result = data.filter(x => x.active).map(x => x.value);",
      "voiceover": "This works, but it's hard to read. Let's refactor it.",
      "voiceoverTiming": "during",
      "moveCursor": "stay"
    },
    {
      "type": "replace",
      "find": "const result = data.filter(x => x.active).map(x => x.value);",
      "with": "const activeItems = data.filter(x => x.active);\nconst result = activeItems.map(x => x.value);",
      "voiceover": "Much better! Now it's clear we're filtering first, then mapping.",
      "voiceoverTiming": "after"
    }
  ]
}
```

---

## Troubleshooting

### Issue: Pattern Not Found

**Problem:** `Pattern not found: "my pattern"`

**Solutions:**
1. Check for typos in the pattern
2. Use `near` to provide context
3. Verify the code exists before trying to find it
4. Remember fuzzy matching ignores whitespace

```json
// Add context
{
  "find": "return value;",
  "near": "calculateTotal function"
}
```

### Issue: Cursor in Wrong Location

**Problem:** Next `writeText` inserts code in the wrong place

**Solutions:**
1. Always set `moveCursor` on highlights
2. Use `insert` with `after`/`before` instead of `writeText`
3. Use explicit cursor positioning

```json
{
  "type": "highlight",
  "find": "something",
  "moveCursor": "endOfFile"  // Add this
}
```

### Issue: Code Looks Messy

**Problem:** Indentation is wrong or inconsistent

**Solutions:**
1. The extension auto-formats, but provide proper relative indentation
2. Use consistent spacing in `content`
3. Let the extension handle absolute indentation

```json
// Your content should have relative indentation
{
  "after": "function example() {",
  "content": "    // Indented once relative to function\n    console.log('hello');\n"
}
```

### Issue: Multiple Matches

**Problem:** Pattern matches multiple locations

**Solutions:**
1. Use more specific patterns
2. Add `near` or `inside` context
3. Use `occurrence` to select specific match

```json
{
  "find": "return",
  "near": "getUserData",
  "occurrence": 1
}
```

### Issue: Voiceover and Highlight Mismatch

**Problem:** Highlight disappears before voiceover finishes

**Solution:** Always use `voiceoverTiming: "during"` for highlights

```json
{
  "type": "highlight",
  "voiceoverTiming": "during",  // Required!
  "voiceover": "Long explanation here..."
}
```

---

## Complete Example Blueprint

Here's a comprehensive example showing all concepts:

```json
{
  "rootFolder": "todo-app",
  "globalTypingSpeed": 35,
  "actionDelay": 1200,
  "defaultVoice": "en-US-AndrewMultilingualNeural",
  "enableVoiceover": true,
  "actions": [
    {
      "type": "createFile",
      "path": "todo.js",
      "voiceover": "Let's build a simple todo application from scratch.",
      "voiceoverTiming": "before"
    },
    {
      "type": "openFile",
      "path": "todo.js"
    },
    {
      "type": "writeText",
      "content": "// Todo Application\n// Demonstrates basic CRUD operations\n\n",
      "voiceover": "We start with clear documentation.",
      "voiceoverTiming": "during"
    },
    {
      "type": "writeText",
      "content": "class TodoList {\n    constructor() {\n        this.todos = [];\n        this.nextId = 1;\n    }\n}\n",
      "voiceover": "Our TodoList class stores todos and tracks IDs.",
      "voiceoverTiming": "during",
      "typingSpeed": 30
    },
    {
      "type": "highlight",
      "path": "todo.js",
      "find": "this.todos = [];",
      "voiceover": "The todos array holds all our todo items.",
      "voiceoverTiming": "during",
      "moveCursor": "endOfFile"
    },
    {
      "type": "insert",
      "after": "this.nextId = 1;",
      "content": "\n    addTodo(text) {\n        const todo = {\n            id: this.nextId++,\n            text: text,\n            completed: false\n        };\n        this.todos.push(todo);\n        return todo;\n    }\n",
      "voiceover": "The addTodo method creates and stores new todos.",
      "voiceoverTiming": "during",
      "typingSpeed": 30
    },
    {
      "type": "highlight",
      "path": "todo.js",
      "find": "id: this.nextId++",
      "voiceover": "We auto-increment the ID for each new todo.",
      "voiceoverTiming": "during",
      "moveCursor": "endOfFile",
      "near": "addTodo"
    },
    {
      "type": "writeText",
      "content": "\n// Create instance and test\nconst myTodos = new TodoList();\nmyTodos.addTodo('Learn JSON blueprints');\nmyTodos.addTodo('Build amazing tutorials');\nconsole.log(myTodos.todos);\n",
      "voiceover": "Finally, let's test our todo list with some examples.",
      "voiceoverTiming": "during"
    }
  ]
}
```

---

## Final Tips

1. **Test incrementally**: Build your blueprint action by action
2. **Use descriptive voiceovers**: Explain the "why", not just the "what"
3. **Keep actions focused**: One logical step per action
4. **Mind the pacing**: Balance speed with comprehension
5. **Preview the flow**: Imagine watching your tutorial as a viewer
6. **Use comments strategically**: Add them before code blocks for context
7. **Handle edge cases**: Always specify `moveCursor` for highlights
8. **Be consistent**: Use similar patterns throughout your blueprint

Remember: The goal is to create a smooth, educational experience that feels like a live coding session with clear explanations!
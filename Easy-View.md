# JSON Project Builder - Quick Guide

## What Is It?
A VS Code extension that automates project creation and generates coding tutorials with AI voiceovers using JSON blueprints.

---

## Basic Structure

```json
{
  "rootFolder": "project-name",
  "globalTypingSpeed": 35,
  "actionDelay": 1000,
  "defaultVoice": "en-US-AndrewMultilingualNeural",
  "enableVoiceover": true,
  "actions": [
    // Your actions go here
  ]
}
```

---

## Core Actions

### 1. Create Folders & Files

**Important:** Always create folders BEFORE creating files inside them!

```json
{
  "type": "createFolder",
  "path": "src",
  "voiceover": "Creating source folder"
}
```

```json
{
  "type": "createFile",
  "path": "src/main.py",
  "voiceover": "Creating main Python file"
}
```

### 2. Open & Write

```json
{
  "type": "openFile",
  "path": "src/main.py",
  "voiceover": "Opening the main file"
}
```

```json
{
  "type": "writeText",
  "content": "print('Hello World')\n",
  "voiceover": "Writing our first line of code",
  "typingSpeed": 30
}
```

### 3. Highlight Code

```json
{
  "type": "highlight",
  "path": "src/main.py",
  "find": "print('Hello World')",
  "voiceover": "This line prints Hello World to the console"
}
```

---

## Valid Highlight Properties

✅ **Allowed:**
- `path` (required)
- `find` (required)
- `voiceover` (required)
- `near` (optional - for disambiguation)
- `inside` (optional - for disambiguation)
- `occurrence` (optional - which match to highlight)
- `voice` (optional - override default voice)
- `voiceoverTiming` (optional - "before", "during", "after")

❌ **NOT Allowed:**
- `moveCursor` - This property doesn't exist!
- Any other undocumented properties

---

## Voiceover Timing

```json
{
  "voiceover": "Explanation text",
  "voiceoverTiming": "before"  // Options: "before", "during", "after"
}
```

- **`"before"`** - Speak, then execute action (default)
- **`"during"`** - Speak while action executes
- **`"after"`** - Execute action, then speak

---

## Common Mistakes

### ❌ Wrong: File before folder
```json
{
  "type": "createFile",
  "path": "Python/solution.py"  // Error! Python folder doesn't exist
}
```

### ✅ Correct: Folder first
```json
{
  "type": "createFolder",
  "path": "Python"
},
{
  "type": "createFile",
  "path": "Python/solution.py"
}
```

### ❌ Wrong: Invalid property
```json
{
  "type": "highlight",
  "find": "code",
  "moveCursor": "newLine"  // This doesn't exist!
}
```

### ✅ Correct: Valid properties only
```json
{
  "type": "highlight",
  "path": "main.py",
  "find": "code",
  "voiceover": "Explanation"
}
```

---

## Complete Example

```json
{
  "rootFolder": "hello-python",
  "globalTypingSpeed": 35,
  "actionDelay": 1000,
  "defaultVoice": "en-US-AndrewMultilingualNeural",
  "enableVoiceover": true,
  "actions": [
    {
      "type": "createFolder",
      "path": "src",
      "voiceover": "First, we create a source folder"
    },
    {
      "type": "createFile",
      "path": "src/main.py",
      "voiceover": "Now let's create our main Python file"
    },
    {
      "type": "openFile",
      "path": "src/main.py",
      "voiceover": "Opening the file to add our code"
    },
    {
      "type": "writeText",
      "content": "def greet(name):\n    return f'Hello, {name}!'\n\n",
      "voiceover": "We define a simple greeting function",
      "voiceoverTiming": "during"
    },
    {
      "type": "writeText",
      "content": "print(greet('World'))\n",
      "voiceover": "And we call it to print Hello World"
    },
    {
      "type": "highlight",
      "path": "src/main.py",
      "find": "def greet(name):",
      "voiceover": "This function takes a name parameter and returns a greeting"
    }
  ]
}
```

---

## Quick Tips

1. **Always create folders before files inside them**
2. **Write code top to bottom** - use `writeText` sequentially
3. **Highlight after writing** - highlight code only after it's been written
4. **Check spelling** - property names must be exact (no `moveCursor`, etc.)
5. **Use proper paths** - relative to `rootFolder`
6. **Test without voiceover first** - set `"enableVoiceover": false` while testing

---

## Running Your Blueprint

1. Open VS Code
2. Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
3. Type: "JSON Project Builder: Build from JSON"
4. Select your JSON file
5. Watch it build!

---

## Need More?

Check the complete documentation for advanced features like:
- `insert` - Add code at specific locations
- `replace` - Find and replace text
- `delete` - Remove code
- Pattern matching with `near`, `inside`, `occurrence`
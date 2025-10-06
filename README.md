# JSON Project Builder - Complete Guide

## Overview

JSON Project Builder is a VS Code extension that automates project creation, file editing, and tutorial recording through JSON blueprints. It can create files, insert code with smart indentation, highlight sections, and even add AI voiceovers for tutorial videos.

## Blueprint Structure

### Root Configuration

```json
{
  "rootFolder": "my-project",
  "globalTypingSpeed": 50,
  "actionDelay": 800,
  "defaultVoice": "en-US-AriaNeural",
  "enableVoiceover": true,
  "actions": [...]
}
```

**Properties:**
- `rootFolder` (required): Base directory name where project will be created
- `globalTypingSpeed` (optional, default: 50): Milliseconds between each character typed
- `actionDelay` (optional, default: 800): Milliseconds to wait between actions
- `defaultVoice` (optional, default: "en-US-AriaNeural"): Default TTS voice for voiceovers
- `enableVoiceover` (optional, default: true): Enable/disable voiceover playback
- `actions` (required): Array of action objects to execute

---

## Action Types

### 1. `createFolder`

Creates a new folder and reveals it in the explorer.

```json
{
  "type": "createFolder",
  "path": "src/components",
  "voiceover": "First, let's create a components folder",
  "voiceoverTiming": "before"
}
```

**Properties:**
- `path` (required): Relative path from rootFolder

---

### 2. `createFile`

Creates a new empty file and reveals it in the explorer.

```json
{
  "type": "createFile",
  "path": "src/index.js",
  "voiceover": "Now we'll create our main entry file",
  "voiceoverTiming": "before"
}
```

**Properties:**
- `path` (required): Relative path from rootFolder

---

### 3. `openFile`

Opens an existing file in the editor.

```json
{
  "type": "openFile",
  "path": "src/index.js",
  "voiceover": "Let's open the index file to add our code"
}
```

**Properties:**
- `path` (required): Relative path from rootFolder

---

### 4. `writeText`

Types text at the current cursor position with animation.

```json
{
  "type": "writeText",
  "content": "console.log('Hello World');",
  "typingSpeed": 30,
  "voiceover": "We'll start with a simple hello world",
  "voiceoverTiming": "during"
}
```

**Properties:**
- `content` (required): Text to type
- `typingSpeed` (optional): Override global typing speed for this action

---

### 5. `insert`

Inserts code at a specific location with **smart indentation detection**.

#### Insert After Pattern

```json
{
  "type": "insert",
  "after": "def main():",
  "content": "print('Starting application')\nprint('Loading modules')",
  "voiceover": "Let's add initialization code"
}
```

#### Insert Before Pattern

```json
{
  "type": "insert",
  "before": "if __name__ == '__main__':",
  "content": "def cleanup():\n    print('Cleaning up')\n",
  "voiceover": "We need a cleanup function before the main guard"
}
```

#### Insert At Line Number

```json
{
  "type": "insert",
  "at": 5,
  "content": "# Configuration section\nCONFIG = {}\n",
  "voiceover": "Adding configuration at line 5"
}
```

**Location Properties (choose one):**
- `after` (string): Insert after line containing this pattern
- `before` (string): Insert before line containing this pattern
- `at` (number): Insert at specific line number (0-indexed)

**Content Properties:**
- `content` (required): Code to insert (indentation is automatically normalized)

**Context Disambiguation (optional):**
- `near` (string): Find pattern near this context text (within ±20 lines)
- `inside` (string): Find pattern inside this context text (within ±20 lines)
- `occurrence` (number): Which occurrence to use (1-indexed, default: 1)

**Smart Indentation:**
- Automatically detects tabs vs spaces
- Preserves relative indentation in multi-line content
- Adds extra indentation after lines ending with `:` (Python)
- Matches sibling-level indentation for other cases

---

### 6. `delete`

Finds and deletes text from the document.

```json
{
  "type": "delete",
  "find": "console.log('debug')",
  "voiceover": "Let's remove this debug statement"
}
```

**Properties:**
- `find` (required): Text pattern to find and delete (fuzzy matched, ignores whitespace)

---

### 7. `replace`

Finds text and replaces it with new content.

```json
{
  "type": "replace",
  "find": "localhost:3000",
  "with": "localhost:8080",
  "typingSpeed": 20,
  "voiceover": "Changing the port number to 8080"
}
```

**Properties:**
- `find` (required): Text pattern to find
- `with` (required): Replacement text
- `typingSpeed` (optional): Speed for typing replacement

---

### 8. `highlight`

Opens a file, finds a pattern, and highlights it (useful for explanations).

```json
{
  "type": "highlight",
  "path": "src/utils.js",
  "find": "function calculateTotal",
  "voiceover": "Notice how we calculate the total here",
  "near": "shopping cart",
  "occurrence": 1
}
```

**Properties:**
- `path` (required): File to open
- `find` (required): Pattern to highlight
- `voiceover` (required): Explanation of what's being highlighted
- `near` (optional): Context for disambiguation
- `inside` (optional): Alternative context for disambiguation
- `occurrence` (optional): Which match to highlight (default: 1)

---

## Voiceover Configuration

All actions support optional voiceover narration:

```json
{
  "type": "createFile",
  "path": "app.py",
  "voiceover": "Let's create our main application file",
  "voice": "en-US-GuyNeural",
  "voiceoverTiming": "before"
}
```

**Voiceover Properties:**
- `voiceover` (optional): Text to speak
- `voice` (optional): Override default voice (uses Azure Neural TTS voices)
- `voiceoverTiming` (optional): When to play voiceover
  - `"before"` - Play before executing action (default)
  - `"during"` - Play while action executes
  - `"after"` - Play after action completes

**Available Voices (examples):**
- `en-US-AriaNeural` (Female, default)
- `en-US-GuyNeural` (Male)
- `en-US-JennyNeural` (Female)
- `en-GB-SoniaNeural` (British Female)
- `en-AU-NatashaNeural` (Australian Female)

---

## Pattern Matching & Disambiguation

The extension uses **fuzzy matching** - it trims whitespace when searching for patterns.

### Basic Pattern Matching

```json
{
  "type": "insert",
  "after": "def process_data():",
  "content": "data = load_data()"
}
```

This will match any of:
- `def process_data():`
- `    def process_data():`
- `        def process_data():`

### Using Context for Disambiguation

When multiple matches exist, use `near` or `inside`:

```json
{
  "type": "insert",
  "after": "return result",
  "near": "calculate_total",
  "content": "logger.info('Calculation complete')"
}
```

This finds `return result` within ±20 lines of `calculate_total`.

### Selecting Specific Occurrence

```json
{
  "type": "replace",
  "find": "TODO",
  "with": "DONE",
  "occurrence": 3
}
```

Replaces the 3rd occurrence of "TODO".

---

## Complete Example: Python Flask App

```json
{
  "rootFolder": "flask-demo",
  "globalTypingSpeed": 40,
  "actionDelay": 1000,
  "defaultVoice": "en-US-AriaNeural",
  "enableVoiceover": true,
  "actions": [
    {
      "type": "createFolder",
      "path": "templates",
      "voiceover": "First, we'll create a templates folder for our HTML files"
    },
    {
      "type": "createFile",
      "path": "app.py",
      "voiceover": "Now let's create the main application file"
    },
    {
      "type": "openFile",
      "path": "app.py",
      "voiceover": "Opening app.py to write our Flask code"
    },
    {
      "type": "writeText",
      "content": "from flask import Flask, render_template\n\napp = Flask(__name__)\n",
      "voiceover": "We start by importing Flask and creating our app instance",
      "voiceoverTiming": "during"
    },
    {
      "type": "insert",
      "after": "app = Flask(__name__)",
      "content": "\n@app.route('/')\ndef home():\n    return render_template('index.html')\n",
      "voiceover": "Now let's add a route for the home page"
    },
    {
      "type": "insert",
      "after": "return render_template('index.html')",
      "content": "\n@app.route('/about')\ndef about():\n    return render_template('about.html')\n",
      "voiceover": "And another route for the about page"
    },
    {
      "type": "insert",
      "at": -1,
      "content": "\nif __name__ == '__main__':\n    app.run(debug=True)\n",
      "voiceover": "Finally, we add the code to run our server"
    },
    {
      "type": "highlight",
      "path": "app.py",
      "find": "@app.route('/')",
      "voiceover": "This decorator tells Flask to call this function when someone visits the home page"
    },
    {
      "type": "createFile",
      "path": "templates/index.html",
      "voiceover": "Creating our index template"
    },
    {
      "type": "openFile",
      "path": "templates/index.html"
    },
    {
      "type": "writeText",
      "content": "<!DOCTYPE html>\n<html>\n<head>\n    <title>Flask Demo</title>\n</head>\n<body>\n    <h1>Welcome!</h1>\n</body>\n</html>",
      "voiceover": "Adding basic HTML structure",
      "typingSpeed": 25
    }
  ]
}
```

---

## Tips & Best Practices

### 1. **Indentation is Automatic**
Don't worry about matching indentation in your `content` - the extension handles it:

```json
{
  "type": "insert",
  "after": "class MyClass:",
  "content": "def __init__(self):\n    self.data = []\n    self.count = 0"
}
```

Even if you write content without indentation, it will be properly indented.

### 2. **Use Descriptive Voiceovers**
Make voiceovers conversational and educational:
- ✅ "Now we'll add error handling to catch any issues"
- ❌ "Inserting try-catch block"

### 3. **Timing Voiceovers**
- Use `"before"` for explanations
- Use `"during"` for longer actions to save time
- Use `"after"` for confirmations or next steps

### 4. **Action Delays**
Adjust delays based on complexity:
- Simple actions: 500-800ms
- File operations: 1000-1500ms
- Complex animations: 2000ms+

### 5. **Pattern Matching**
Make patterns specific enough to be unique:
- ✅ `"def calculate_total(items):"`
- ❌ `"def"` (too generic)

### 6. **Multi-line Content**
Use `\n` for newlines in JSON strings:

```json
{
  "content": "function example() {\n    console.log('hello');\n    return true;\n}"
}
```

### 7. **Testing**
Start with `enableVoiceover: false` while testing to speed up iterations.

---

## Running Your Blueprint

1. Open VS Code with a workspace folder
2. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
3. Type "JSON Project Builder: Build from JSON"
4. Select your blueprint JSON file
5. Watch the magic happen!

---

## Troubleshooting

**Pattern not found errors:**
- Make sure your pattern exists in the file
- Try using a more specific or unique pattern
- Use `near` or `inside` for disambiguation
- Check that the file has been created and opened first

**Indentation issues:**
- The extension auto-detects tabs vs spaces
- Relative indentation in your content is preserved
- If issues persist, check your `content` formatting

**Voiceover not playing:**
- Ensure `enableVoiceover: true` in root config
- Check that your system has audio output
- Verify the voice name is correct

---

## Advanced Patterns

### Creating a Full Project Structure

```json
{
  "rootFolder": "my-app",
  "actions": [
    {"type": "createFolder", "path": "src"},
    {"type": "createFolder", "path": "src/components"},
    {"type": "createFolder", "path": "src/utils"},
    {"type": "createFolder", "path": "tests"},
    {"type": "createFile", "path": "src/index.js"},
    {"type": "createFile", "path": "package.json"},
    {"type": "createFile", "path": "README.md"}
  ]
}
```

### Refactoring Code

```json
{
  "actions": [
    {
      "type": "openFile",
      "path": "app.js"
    },
    {
      "type": "replace",
      "find": "var",
      "with": "const",
      "occurrence": 1,
      "voiceover": "Let's modernize this code by using const instead of var"
    },
    {
      "type": "insert",
      "after": "const app = express()",
      "content": "\n// Middleware configuration\napp.use(express.json());\n"
    }
  ]
}
```

---

## License

This extension processes JSON blueprints to automate VS Code actions. Created for educational content creators and developers who want to build reproducible project setups.
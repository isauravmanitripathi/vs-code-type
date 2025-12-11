# Python Blueprint Generator

Automatically generate VS Code JSON Project Builder blueprints from annotated Python source files.

## Overview

This tool parses Python files and extracts:
- **`#` comments** → Voiceover for highlighting code below
- **`"""docstrings"""`** → Voiceover after typing the function
- **Inline comments** → Highlight that line with explanation

## Installation

No dependencies required! Uses only Python standard library.

```bash
cd blueprint-generator
python generator.py --help
```

## Usage

### Basic Usage

```bash
# Output to stdout
python generator.py /path/to/script.py

# Save to file
python generator.py /path/to/script.py -o blueprint.json
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `-o, --output` | stdout | Output file path |
| `--typing-speed` | 35 | Milliseconds per character |
| `--action-delay` | 1000 | Pause between actions (ms) |
| `--voice` | en-US-BrianNeural | Azure TTS voice |
| `--no-voiceover` | false | Disable voiceover |
| `--indent` | 2 | JSON indentation |
| `-v, --verbose` | false | Print parsing details |

### Examples

```bash
# Fast typing, custom voice
python generator.py script.py --typing-speed 20 --voice "en-US-AriaNeural"

# Verbose output
python generator.py script.py -v -o blueprint.json

# Silent mode (no voiceover)
python generator.py script.py --no-voiceover -o silent.json
```

## How to Annotate Python Files

### 1. Comments Above Code → Highlight + Voiceover

```python
# Importing libraries for data processing
import pandas as pd
import numpy as np
```

**Result:** Types imports, then highlights first line with voiceover.

### 2. Function Docstrings → Voiceover After Typing

```python
def calculate(x, y):
    """
    Calculates the sum of two numbers.
    This function demonstrates basic arithmetic.
    """
    return x + y
```

**Result:** Types function (without docstring), then highlights function signature with docstring as voiceover.

### 3. Inline Comments → Highlight That Line

```python
result = data.filter(active=True)  # Filter only active items
```

**Result:** Types line, then highlights it with comment as voiceover.

### 4. Variable Comments

```python
# Setting random seed for reproducibility
SEED = 42
```

**Result:** Types variable, then highlights with comment voiceover.

## Generated Blueprint Structure

```json
{
  "rootFolder": "script-demo",
  "globalTypingSpeed": 35,
  "actionDelay": 1000,
  "defaultVoice": "en-US-BrianNeural",
  "enableVoiceover": true,
  "actions": [
    {"type": "createFile", "path": "script.py", ...},
    {"type": "openFile", "path": "script.py"},
    {"type": "writeText", "content": "import pandas as pd\n..."},
    {"type": "highlight", "find": "import pandas", "voiceover": "..."},
    ...
  ]
}
```

## Complete Example

**Input:** `example.py`

```python
# Importing necessary libraries
import os
import sys

# Configuration constant
SEED = 42

def process(data):
    """
    Process the input data and return results.
    This function applies transformations to clean the data.
    """
    result = data.strip()  # Remove whitespace
    return result

if __name__ == '__main__':
    process("hello")
```

**Command:**

```bash
python generator.py example.py -o example-blueprint.json -v
```

**Output Blueprint:** Creates typing + highlighting actions for each segment.

## File Structure

```
blueprint-generator/
├── generator.py          # CLI entry point
├── parser.py             # Python source parser
├── blueprint_builder.py  # Blueprint generator
└── README.md             # This file
```

## Tips

1. **Use descriptive docstrings** - They become your voiceover script
2. **Add comments above important code** - Creates natural highlight points
3. **Use inline comments sparingly** - Each becomes a separate highlight
4. **Test with `-v` flag first** - See what segments are detected

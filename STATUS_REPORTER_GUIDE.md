# HTTP Status Reporter Guide

The VS Code extension can report its progress to a Python HTTP server. This allows automation scripts to know exactly when the extension finishes.

## How It Works

```
Extension (TypeScript)          Python Server
        │                            │
        ├── POST /status ──────────► │ {"event": "started", ...}
        │                            │
        ├── POST /status ──────────► │ {"event": "action_start", ...}
        ├── POST /status ──────────► │ {"event": "action_complete", ...}
        │   ... (for each action)    │
        │                            │
        └── POST /status ──────────► │ {"event": "all_done", ...}
```

The extension sends **fire-and-forget** HTTP POST requests to `http://localhost:5555/status`. If no server is running, it silently continues.

---

## Status Events

| Event | When Sent | Payload |
|-------|-----------|---------|
| `started` | Blueprint processing begins | `blueprint`, `total` |
| `action_start` | Before each action | `step`, `total`, `action` |
| `action_complete` | After action succeeds | `step`, `total`, `success: true` |
| `action_error` | After action fails | `step`, `total`, `action`, `error` |
| `blueprint_done` | Single blueprint finishes | `blueprint`, `success` |
| `all_done` | All processing complete | `success`, `total` (blueprints), `step` (success count) |

---

## Test Server (Python)

Save this as `status_server.py` and run it:

```python
#!/usr/bin/env python3
"""Simple HTTP server to receive status updates from VS Code extension"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
from datetime import datetime

class StatusHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        # Read JSON body
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        data = json.loads(body)
        
        # Format timestamp
        ts = datetime.fromtimestamp(data['timestamp'] / 1000).strftime('%H:%M:%S')
        event = data['event']
        
        # Pretty print based on event type
        if event == 'started':
            print(f"\n{'='*50}")
            print(f"[{ts}] 🚀 STARTED: {data.get('blueprint')} ({data.get('total')} actions)")
            print(f"{'='*50}")
        
        elif event == 'action_start':
            step = data.get('step', '?')
            total = data.get('total', '?')
            action = data.get('action', 'unknown')
            print(f"[{ts}] ▶️  [{step}/{total}] {action}")
        
        elif event == 'action_complete':
            step = data.get('step', '?')
            total = data.get('total', '?')
            print(f"[{ts}] ✅ [{step}/{total}] Complete")
        
        elif event == 'action_error':
            step = data.get('step', '?')
            total = data.get('total', '?')
            error = data.get('error', 'Unknown error')
            print(f"[{ts}] ❌ [{step}/{total}] ERROR: {error}")
        
        elif event == 'blueprint_done':
            blueprint = data.get('blueprint', 'unknown')
            success = '✅' if data.get('success') else '❌'
            print(f"[{ts}] {success} Blueprint done: {blueprint}")
        
        elif event == 'all_done':
            success_count = data.get('step', 0)  # Reused field
            total = data.get('total', 0)
            print(f"\n{'='*50}")
            print(f"[{ts}] 🏁 ALL DONE: {success_count}/{total} succeeded")
            print(f"{'='*50}\n")
        
        else:
            print(f"[{ts}] 📨 {event}: {json.dumps(data)}")
        
        # Send response
        self.send_response(200)
        self.end_headers()
    
    def log_message(self, format, *args):
        pass  # Suppress default logging

if __name__ == '__main__':
    PORT = 5555
    server = HTTPServer(('localhost', PORT), StatusHandler)
    print(f"🖥️  Status server running on http://localhost:{PORT}")
    print("Waiting for extension updates...\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
```

---

## Usage

### 1. Start the server

```bash
python3 status_server.py
```

### 2. Run the extension

In VS Code, press `Ctrl+Shift+P` and run "Build Project from JSON Blueprint"

### 3. Watch the output

```
🖥️  Status server running on http://localhost:5555
Waiting for extension updates...

==================================================
[14:21:03] 🚀 STARTED: terminal-test.json (5 actions)
==================================================
[14:21:03] ▶️  [1/5] Creating folder: src
[14:21:03] ✅ [1/5] Complete
[14:21:04] ▶️  [2/5] Creating file: src/main.py
[14:21:04] ✅ [2/5] Complete
...
==================================================
[14:21:08] 🏁 ALL DONE: 1/1 succeeded
==================================================
```

---

## Integration with Automation

In your Python automation script, replace the hardcoded `time.sleep()` with the server:

```python
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
import json

extension_done = False
extension_success = False

class StatusHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        global extension_done, extension_success
        data = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))))
        
        if data['event'] == 'all_done':
            extension_done = True
            extension_success = data.get('success', False)
        
        self.send_response(200)
        self.end_headers()
    
    def log_message(self, *args): pass

# Start server in background thread
server = HTTPServer(('localhost', 5555), StatusHandler)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()

# ... launch VS Code and trigger extension ...

# Wait for extension to finish (instead of time.sleep)
while not extension_done:
    time.sleep(1)

if extension_success:
    print("Extension completed successfully!")
else:
    print("Extension had errors")

# Stop recording, cleanup, etc.
```

---

## Calling Extension with Path Argument

For full automation (no file picker dialog), use `xdotool` to run a command that provides the path:

### Method 1: Type command in VS Code terminal (xdotool)

```python
# After VS Code opens, type in the command palette:
press_key("ctrl+shift+p")
time.sleep(1)
type_text("> JSON Project Builder: Build From Path")
press_key("Return")

# The extension will prompt for path in the input box
# Or use executeCommand directly via CLI
```

### Method 2: VS Code CLI with arguments

```bash
# From command line, you can use VS Code's remote command execution:
code --command "json-project-builder.buildFromJson" --args "/path/to/blueprint.json"
```

### Method 3: Using xdotool to type command with path

```python
# Open command palette and run with path argument
subprocess.run("xdotool key ctrl+shift+p", shell=True)
time.sleep(1)
subprocess.run('xdotool type "> workbench.action.terminal.sendSequence"', shell=True)
# ... complex xdotool sequence to pass arguments
```

### Recommended: File-based approach

The simplest approach for automation is:
1. Copy your JSON file to a known location (e.g., `/tmp/current-blueprint.json`)
2. Use the status server to know when done
3. The extension handles the file picker normally, or use xdotool to type the path

---

## Error Reporting

When the extension crashes or encounters errors, it reports them to the server:

```json
{
  "event": "error",
  "error": "Fatal extension error: Pattern not found for highlight",
  "timestamp": 1733657143000
}
```

followed by:

```json
{
  "event": "all_done",
  "success": false,
  "total": 1,
  "step": 0,
  "timestamp": 1733657143100
}
```

Your Python server can detect failures and stop recording appropriately.

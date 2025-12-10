# HTTP Server API Guide

The JSON Project Builder extension includes a built-in HTTP server that allows you to trigger blueprint execution from the terminal, scripts, or any HTTP client.

## Quick Start

The server **starts automatically** when the extension loads and listens on **port 3000** by default.

### Test from Terminal

```bash
# Execute a blueprint
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{"path": "/Volumes/hard-drive/auto-write-vs-code/json-project-builder/rust-demo.json"}'

# Check server status
curl http://localhost:3000/status
```

---

## API Endpoints

### POST /execute

Execute a blueprint from a JSON file.

**Request:**
```bash
POST http://localhost:3000/execute
Content-Type: application/json

{
  "path": "/absolute/path/to/blueprint.json"
}
```

**Response (202 Accepted):**
```json
{
  "success": true,
  "message": "Blueprint execution started"
}
```

**Error Response (400 Bad Request):**
```json
{
  "success": false,
  "message": "Bad Request",
  "error": "Missing \"path\" field in request body"
}
```

**Notes:**
- Returns immediately (202 Accepted) - execution happens asynchronously
- Path must be absolute
- Path must end with `.json`
- Watch VS Code for execution progress

---

### GET /status

Check if the server is running.

**Request:**
```bash
GET http://localhost:3000/status
```

**Response (200 OK):**
```json
{
  "running": true,
  "port": 3000,
  "version": "0.0.1"
}
```

---

## Configuration

Configure the server in VS Code settings:

### Enable/Disable Server

```json
{
  "json-project-builder.server.enabled": true
}
```

### Change Port

```json
{
  "json-project-builder.server.port": 3000
}
```

**To change settings:**
1. Press `Ctrl+,` (or `Cmd+,` on Mac)
2. Search for "JSON Project Builder"
3. Modify server settings
4. Reload VS Code window

---

## Usage Examples

### From Terminal (curl)

```bash
# Execute rust demo
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{"path": "/Volumes/hard-drive/auto-write-vs-code/json-project-builder/rust-demo.json"}'

# Execute Python demo
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{"path": "/Volumes/hard-drive/auto-write-vs-code/json-project-builder/python-gui-demo.json"}'
```

### From Python Script

```python
import requests
import time

# Start execution
response = requests.post('http://localhost:3000/execute', json={
    'path': '/path/to/blueprint.json'
})

if response.status_code == 202:
    print("✅ Blueprint execution started")
    print(response.json())
else:
    print("❌ Error:", response.json())

# Optional: Monitor status via the status reporter
# (requires running the Python status server on port 5555)
```

### From JavaScript/Node.js

```javascript
const fetch = require('node-fetch');

async function executeBlueprint(path) {
  const response = await fetch('http://localhost:3000/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path })
  });
  
  const result = await response.json();
  console.log(result);
}

executeBlueprint('/path/to/blueprint.json');
```

### From Shell Script

```bash
#!/bin/bash

# Array of blueprints to execute
blueprints=(
  "/path/to/01-setup.json"
  "/path/to/02-backend.json"
  "/path/to/03-frontend.json"
)

# Execute each blueprint
for blueprint in "${blueprints[@]}"; do
  echo "Executing: $blueprint"
  curl -X POST http://localhost:3000/execute \
    -H "Content-Type: application/json" \
    -d "{\"path\": \"$blueprint\"}"
  
  # Wait between executions
  sleep 5
done
```

---

## Integration with Status Reporter

Combine the HTTP server with the status reporter for complete automation:

### 1. Start Status Reporter Server

```python
# status_server.py
from http.server import HTTPServer, BaseHTTPRequestHandler
import json

class StatusHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        data = json.loads(self.rfile.read(
            int(self.headers.get('Content-Length', 0))
        ))
        
        event = data['event']
        if event == 'all_done':
            print("✅ Blueprint execution completed!")
        
        self.send_response(200)
        self.end_headers()
    
    def log_message(self, *args): pass

server = HTTPServer(('localhost', 5555), StatusHandler)
print("Status server running on port 5555...")
server.serve_forever()
```

### 2. Trigger Execution

```bash
# In another terminal
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{"path": "/path/to/blueprint.json"}'
```

### 3. Monitor Progress

The status server (port 5555) will receive:
- `started` - Blueprint processing begins
- `action_start` - Each action starts
- `action_complete` - Each action completes
- `all_done` - Everything finished

---

## Troubleshooting

### Port Already in Use

If you see: `Port 3000 is already in use`

**Solution 1:** Change the port in settings
```json
{
  "json-project-builder.server.port": 3001
}
```

**Solution 2:** Kill the process using port 3000
```bash
# macOS/Linux
lsof -ti:3000 | xargs kill -9

# Or find and kill manually
lsof -i:3000
kill -9 <PID>
```

### Server Not Starting

**Check:**
1. Is the extension activated? (Check "Extensions" panel)
2. Is server enabled in settings?
3. Check VS Code Developer Tools console for errors

**Enable server:**
```json
{
  "json-project-builder.server.enabled": true
}
```

### Connection Refused

**Possible causes:**
1. Extension not running
2. Server disabled in settings
3. Wrong port number

**Verify server is running:**
```bash
curl http://localhost:3000/status
```

### Blueprint Not Executing

**Check:**
1. Path is absolute (not relative)
2. Path ends with `.json`
3. File exists at the path
4. VS Code has a workspace open

**Valid path examples:**
- ✅ `/Users/name/project/blueprint.json`
- ✅ `/Volumes/drive/folder/file.json`
- ❌ `./blueprint.json` (relative)
- ❌ `blueprint.json` (no path)
- ❌ `/path/to/file.txt` (not .json)

---

## CORS Support

The server includes CORS headers, allowing requests from:
- Web browsers
- Browser extensions
- Any origin

This enables integration with web-based automation tools.

---

## Security Notes

⚠️ **Important:**
- Server listens on `localhost` only (not accessible from network)
- No authentication required (local development tool)
- Only accepts file paths (no arbitrary code execution)
- Validates `.json` file extension

For production use, consider:
- Adding authentication
- Restricting allowed paths
- Rate limiting
- HTTPS support

---

## Complete Automation Example

```bash
#!/bin/bash
# complete_automation.sh

# 1. Start VS Code with workspace
code /path/to/workspace &
sleep 3

# 2. Wait for extension to load
echo "Waiting for extension..."
until curl -s http://localhost:3000/status > /dev/null; do
  sleep 1
done
echo "✅ Extension ready"

# 3. Execute blueprint
echo "Starting blueprint execution..."
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{"path": "/path/to/blueprint.json"}'

# 4. Monitor via status reporter (if running)
echo "Monitor progress at http://localhost:5555"
```

---

## Summary

The HTTP server provides a simple, powerful way to automate blueprint execution:

- **Automatic startup** - No manual intervention needed
- **RESTful API** - Standard HTTP/JSON interface
- **Language agnostic** - Use from any language or tool
- **Non-blocking** - Returns immediately, execution happens in background
- **Configurable** - Customize port and enable/disable as needed

Perfect for:
- CI/CD pipelines
- Automated testing
- Batch processing
- Screen recording automation
- Integration with other tools

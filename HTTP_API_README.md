# JSON Project Builder - HTTP Server API

**Automate VS Code blueprint execution from the terminal using HTTP requests!**

The JSON Project Builder extension includes a built-in HTTP server that starts automatically when VS Code launches. This allows you to trigger blueprint execution, monitor progress, and check status—all from your terminal or automation scripts.

---

## 🚀 Quick Start

### 1. Server Automatically Starts

When you open VS Code with this extension installed, the HTTP server starts automatically on **port 6969**.

You'll see a notification:
```
JSON Project Builder: HTTP server running on port 6969
```

### 2. Test the Server

```bash
curl http://localhost:6969/status
```

**Response:**
```json
{
  "running": true,
  "port": 6969,
  "version": "0.0.1"
}
```

✅ If you see this, the server is working!

---

## 📡 API Endpoints

### GET /status

Check if the server is running.

**Request:**
```bash
curl http://localhost:6969/status
```

**Response:**
```json
{
  "running": true,
  "port": 6969,
  "version": "0.0.1"
}
```

---

### GET /progress

Check the current execution status and progress. The `currentAction` field tells you exactly what the extension is doing and **which file** is being edited.

**Request:**
```bash
curl http://localhost:6969/progress
```

**Response (Idle):**
```json
{
  "busy": false,
  "status": "idle"
}
```

**Response (Processing):**
```json
{
  "busy": true,
  "status": "processing",
  "blueprint": "rust-demo.json",
  "currentAction": "Writing text in src/main.rs",
  "progress": {
    "current": 5,
    "total": 25,
    "percentage": 20
  }
}
```

#### `currentAction` Examples

The `currentAction` field provides detailed information about what's happening:

| Action Type | Example `currentAction` Value |
|-------------|------------------------------|
| `createFolder` | `Creating folder: src/components` |
| `createFile` | `Creating file: src/main.py` |
| `openFile` | `Opening: utils/helpers.py` |
| `writeText` | `Writing text in src/main.py` |
| `insert` | `Inserting after "import os..."` in config.py |
| `insert` (at line) | `Inserting at line 5 in main.rs` |
| `insert` (before) | `Inserting before "def main..."` in app.py |
| `delete` | `Deleting "# TODO:..." in src/lib.rs` |
| `replace` | `Replacing "old_func..." in utils.py` |
| `highlight` | `Highlighting "pattern..." in src/main.py` |
| `openTerminal` | `Opening terminal: Build` |
| `runCommand` | `Running: npm install...` |

**Response (Done):**
```json
{
  "busy": false,
  "status": "done",
  "blueprint": "rust-demo.json",
  "progress": {
    "current": 25,
    "total": 25,
    "percentage": 100
  }
}
```

**Response (Error):**
```json
{
  "busy": false,
  "status": "error",
  "blueprint": "rust-demo.json",
  "error": "Pattern not found: useState(0)",
  "progress": {
    "current": 15,
    "total": 25,
    "percentage": 60
  }
}
```

---

### POST /execute

Execute a blueprint from a JSON file.

**Request:**
```bash
curl -X POST http://localhost:6969/execute \
  -H "Content-Type: application/json" \
  -d '{"path": "/absolute/path/to/blueprint.json"}'
```

**Example:**
```bash
curl -X POST http://localhost:6969/execute \
  -H "Content-Type: application/json" \
  -d '{"path": "/Users/yourname/projects/rust-demo.json"}'
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Blueprint execution started"
}
```

**Response (Error - Missing Path):**
```json
{
  "success": false,
  "message": "Bad Request",
  "error": "Missing \"path\" field in request body"
}
```

**Response (Error - Invalid File):**
```json
{
  "success": false,
  "message": "Bad Request",
  "error": "Path must point to a .json file"
}
```

---

## 🎯 Complete Workflow Example

### Execute and Monitor Progress

```bash
#!/bin/bash

# 1. Execute the blueprint
echo "🚀 Starting blueprint execution..."
curl -X POST http://localhost:6969/execute \
  -H "Content-Type: application/json" \
  -d '{"path": "/path/to/your/blueprint.json"}'

echo -e "\n\n📊 Monitoring progress...\n"

# 2. Poll progress until done
while true; do
  response=$(curl -s http://localhost:6969/progress)
  
  busy=$(echo $response | jq -r '.busy')
  status=$(echo $response | jq -r '.status')
  
  if [ "$busy" = "true" ]; then
    # Still processing
    percentage=$(echo $response | jq -r '.progress.percentage // 0')
    current=$(echo $response | jq -r '.progress.current // 0')
    total=$(echo $response | jq -r '.progress.total // 0')
    action=$(echo $response | jq -r '.currentAction // "Processing..."')
    echo "[$current/$total - $percentage%] $action"
  else
    # Finished
    echo -e "\n✅ Status: $status"
    if [ "$status" = "done" ]; then
      echo "🎉 Blueprint execution completed successfully!"
    elif [ "$status" = "error" ]; then
      error=$(echo $response | jq -r '.error')
      echo "❌ Error: $error"
    fi
    break
  fi
  
  sleep 1
done
```

**Save as `execute_blueprint.sh` and run:**
```bash
chmod +x execute_blueprint.sh
./execute_blueprint.sh
```

---

## 🐍 Python Example

```python
import requests
import time

def execute_blueprint(blueprint_path):
    # Start execution
    print("🚀 Starting blueprint execution...")
    response = requests.post('http://localhost:6969/execute', json={
        'path': blueprint_path
    })
    
    if response.status_code != 202:
        print(f"❌ Failed to start: {response.json()}")
        return
    
    print(response.json()['message'])
    
    # Monitor progress
    print("\n📊 Monitoring progress...\n")
    while True:
        progress = requests.get('http://localhost:6969/progress').json()
        
        if progress['busy']:
            # Still processing
            if 'progress' in progress:
                pct = progress['progress']['percentage']
                current = progress['progress']['current']
                total = progress['progress']['total']
                action = progress.get('currentAction', 'Processing...')
                print(f"[{current}/{total} - {pct}%] {action}")
        else:
            # Finished
            status = progress['status']
            print(f"\n✅ Status: {status}")
            if status == 'done':
                print("🎉 Blueprint execution completed successfully!")
            elif status == 'error':
                print(f"❌ Error: {progress.get('error', 'Unknown error')}")
            break
        
        time.sleep(1)

# Usage
execute_blueprint('/path/to/your/blueprint.json')
```

---

## 🔧 Configuration

### Change Port

1. Open VS Code Settings (`Cmd+,` or `Ctrl+,`)
2. Search for "JSON Project Builder"
3. Change **Server Port** (default: 6969)
4. Reload VS Code window

**Or edit `settings.json`:**
```json
{
  "json-project-builder.server.port": 6969
}
```

### Enable/Disable Server

```json
{
  "json-project-builder.server.enabled": true
}
```

Set to `false` to disable the HTTP server.

---

## 🛠️ Troubleshooting

### Server Not Responding

**Check if server is running:**
```bash
curl http://localhost:6969/status
```

**If no response:**
1. Check if extension is activated (look for notification)
2. Check VS Code Output panel (View → Output → Extension Host)
3. Look for: `[HttpServer] ✅ Server started on http://localhost:6969`

### Port Already in Use

**Find what's using the port:**
```bash
lsof -i:6969
```

**Kill the process:**
```bash
lsof -ti:6969 | xargs kill -9
```

**Or change the port in settings** (see Configuration above).

### Blueprint Not Executing

**Common issues:**
- ✅ Path must be **absolute** (not relative)
- ✅ Path must end with `.json`
- ✅ File must exist
- ✅ VS Code must have a workspace open

**Valid paths:**
```bash
✅ /Users/name/project/blueprint.json
✅ /Volumes/drive/folder/demo.json
❌ ./blueprint.json (relative path)
❌ blueprint.json (no path)
❌ /path/to/file.txt (not .json)
```

---

## 📚 Use Cases

### 1. Automated Testing

Test multiple blueprints in sequence:

```bash
for blueprint in blueprints/*.json; do
  curl -X POST http://localhost:6969/execute \
    -H "Content-Type: application/json" \
    -d "{\"path\": \"$(pwd)/$blueprint\"}"
  
  # Wait for completion
  while true; do
    status=$(curl -s http://localhost:6969/progress | jq -r '.status')
    [ "$status" = "done" ] && break
    [ "$status" = "error" ] && exit 1
    sleep 1
  done
done
```

### 2. Screen Recording Automation

```bash
# Start recording
screencapture -v tutorial.mp4 &
RECORDING_PID=$!

# Execute blueprint
curl -X POST http://localhost:6969/execute \
  -d '{"path": "/path/to/blueprint.json"}'

# Wait for completion
while true; do
  status=$(curl -s http://localhost:6969/progress | jq -r '.status')
  [ "$status" = "done" ] && break
  sleep 1
done

# Stop recording
kill $RECORDING_PID
```

### 3. CI/CD Integration

```yaml
# .github/workflows/test.yml
- name: Test Blueprints
  run: |
    curl -X POST http://localhost:6969/execute \
      -d '{"path": "${{ github.workspace }}/test.json"}'
    
    while true; do
      status=$(curl -s http://localhost:6969/progress | jq -r '.status')
      [ "$status" = "done" ] && break
      [ "$status" = "error" ] && exit 1
      sleep 1
    done
```

---

## 🔒 Security Notes

- Server listens on **localhost only** (127.0.0.1)
- Not accessible from network
- No authentication required (local development tool)
- Only accepts file paths (no code execution)
- Validates `.json` file extension

---

## 📖 API Summary

| Endpoint | Method | Purpose | Response |
|----------|--------|---------|----------|
| `/status` | GET | Check if server is running | Server info |
| `/progress` | GET | Get current execution status | Progress details |
| `/execute` | POST | Start blueprint execution | Confirmation |

---

## 🎓 Examples

### Check Status
```bash
curl http://localhost:6969/status
```

### Execute Blueprint
```bash
curl -X POST http://localhost:6969/execute \
  -H "Content-Type: application/json" \
  -d '{"path": "/path/to/blueprint.json"}'
```

### Monitor Progress
```bash
watch -n 1 'curl -s http://localhost:6969/progress | jq .'
```

### Complete Workflow
```bash
# Execute
curl -X POST http://localhost:6969/execute \
  -d '{"path": "/path/to/blueprint.json"}'

# Monitor
while true; do
  curl -s http://localhost:6969/progress | jq '.status, .progress.percentage'
  sleep 1
done
```

---

## 💡 Tips

1. **Use absolute paths** - Always provide full file paths
2. **Poll every 1 second** - Good balance for progress monitoring
3. **Check status first** - Verify server is running before executing
4. **Use jq for parsing** - Makes JSON responses readable
5. **Script it** - Automate repetitive tasks with shell scripts

---

## 🚀 Getting Started

1. **Install the extension** in VS Code
2. **Open VS Code** - Server starts automatically
3. **Test the server:**
   ```bash
   curl http://localhost:6969/status
   ```
4. **Execute a blueprint:**
   ```bash
   curl -X POST http://localhost:6969/execute \
     -H "Content-Type: application/json" \
     -d '{"path": "/path/to/your/blueprint.json"}'
   ```
5. **Monitor progress:**
   ```bash
   curl http://localhost:6969/progress
   ```

That's it! You're ready to automate blueprint execution from the terminal! 🎉

---

## 📞 Support

For issues or questions:
- Check the troubleshooting section above
- Review the examples
- Check VS Code Output panel for logs

Happy automating! 🚀

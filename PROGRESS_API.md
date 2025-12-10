# Progress Tracking API

The HTTP server now includes a **GET /progress** endpoint that allows you to check the current execution status in real-time.

## Quick Example

```bash
# Start execution
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{"path": "/path/to/blueprint.json"}'

# Check progress (poll this endpoint)
curl http://localhost:3000/progress
```

---

## GET /progress Endpoint

Returns the current execution state of the extension.

### When Idle (Not Processing)

**Request:**
```bash
GET http://localhost:3000/progress
```

**Response:**
```json
{
  "busy": false,
  "status": "idle"
}
```

### When Processing

**Response:**
```json
{
  "busy": true,
  "status": "processing",
  "blueprint": "rust-demo.json",
  "currentAction": "Creating file: src/main.rs",
  "progress": {
    "current": 5,
    "total": 25,
    "percentage": 20
  }
}
```

### When Done

**Response:**
```json
{
  "busy": false,
  "status": "done",
  "blueprint": "rust-demo.json",
  "currentAction": "Highlighting: TaskPriority::Critical",
  "progress": {
    "current": 25,
    "total": 25,
    "percentage": 100
  }
}
```

### When Error Occurred

**Response:**
```json
{
  "busy": false,
  "status": "error",
  "blueprint": "rust-demo.json",
  "currentAction": "Highlighting: useState(0)",
  "progress": {
    "current": 15,
    "total": 25,
    "percentage": 60
  },
  "error": "Pattern not found: useState(0)"
}
```

---

## Status Values

| Status | Description |
|--------|-------------|
| `idle` | No execution in progress |
| `processing` | Currently executing a blueprint |
| `done` | Last execution completed successfully |
| `error` | Last execution failed with an error |

---

## Polling Pattern

Use this pattern to monitor execution progress:

### Bash Script

```bash
#!/bin/bash

# Start execution
echo "Starting blueprint..."
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{"path": "/path/to/blueprint.json"}'

# Poll progress until done
echo "Monitoring progress..."
while true; do
  response=$(curl -s http://localhost:3000/progress)
  status=$(echo $response | jq -r '.status')
  busy=$(echo $response | jq -r '.busy')
  
  if [ "$busy" = "true" ]; then
    percentage=$(echo $response | jq -r '.progress.percentage')
    action=$(echo $response | jq -r '.currentAction')
    echo "[$percentage%] $action"
  else
    echo "Status: $status"
    if [ "$status" = "done" ]; then
      echo "✅ Execution completed!"
      break
    elif [ "$status" = "error" ]; then
      error=$(echo $response | jq -r '.error')
      echo "❌ Error: $error"
      break
    fi
  fi
  
  sleep 1
done
```

### Python Script

```python
import requests
import time

# Start execution
print("Starting blueprint...")
response = requests.post('http://localhost:3000/execute', json={
    'path': '/path/to/blueprint.json'
})

if response.status_code != 202:
    print(f"Failed to start: {response.json()}")
    exit(1)

# Poll progress
print("Monitoring progress...")
while True:
    progress = requests.get('http://localhost:3000/progress').json()
    
    if progress['busy']:
        # Still processing
        if 'progress' in progress:
            pct = progress['progress']['percentage']
            action = progress.get('currentAction', 'Processing...')
            print(f"[{pct}%] {action}")
    else:
        # Finished
        status = progress['status']
        if status == 'done':
            print("✅ Execution completed!")
            break
        elif status == 'error':
            print(f"❌ Error: {progress.get('error', 'Unknown error')}")
            break
        elif status == 'idle':
            # Execution hasn't started yet, wait a bit
            pass
    
    time.sleep(1)
```

### JavaScript/Node.js

```javascript
const fetch = require('node-fetch');

async function monitorExecution(blueprintPath) {
  // Start execution
  console.log('Starting blueprint...');
  const startRes = await fetch('http://localhost:3000/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: blueprintPath })
  });
  
  if (startRes.status !== 202) {
    console.error('Failed to start:', await startRes.json());
    return;
  }
  
  // Poll progress
  console.log('Monitoring progress...');
  while (true) {
    const progress = await fetch('http://localhost:3000/progress')
      .then(r => r.json());
    
    if (progress.busy) {
      const pct = progress.progress?.percentage || 0;
      const action = progress.currentAction || 'Processing...';
      console.log(`[${pct}%] ${action}`);
    } else {
      if (progress.status === 'done') {
        console.log('✅ Execution completed!');
        break;
      } else if (progress.status === 'error') {
        console.error('❌ Error:', progress.error);
        break;
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

monitorExecution('/path/to/blueprint.json');
```

---

## Complete Automation Example

This example starts execution, monitors progress, and records the screen:

```bash
#!/bin/bash
# automated_recording.sh

BLUEPRINT="/path/to/blueprint.json"
RECORDING_OUTPUT="tutorial_$(date +%Y%m%d_%H%M%S).mp4"

# Start screen recording (macOS)
echo "Starting screen recording..."
screencapture -v "$RECORDING_OUTPUT" &
RECORDING_PID=$!

# Wait for recording to initialize
sleep 2

# Start blueprint execution
echo "Starting blueprint execution..."
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d "{\"path\": \"$BLUEPRINT\"}"

# Monitor progress
echo "Monitoring progress..."
while true; do
  response=$(curl -s http://localhost:3000/progress)
  status=$(echo $response | jq -r '.status')
  busy=$(echo $response | jq -r '.busy')
  
  if [ "$busy" = "true" ]; then
    percentage=$(echo $response | jq -r '.progress.percentage')
    current=$(echo $response | jq -r '.progress.current')
    total=$(echo $response | jq -r '.progress.total')
    action=$(echo $response | jq -r '.currentAction')
    echo "[$current/$total - $percentage%] $action"
  else
    if [ "$status" = "done" ]; then
      echo "✅ Execution completed!"
      break
    elif [ "$status" = "error" ]; then
      error=$(echo $response | jq -r '.error')
      echo "❌ Error: $error"
      break
    fi
  fi
  
  sleep 1
done

# Wait a bit for final frames
sleep 3

# Stop recording
echo "Stopping recording..."
kill $RECORDING_PID

echo "Recording saved to: $RECORDING_OUTPUT"
```

---

## Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `busy` | boolean | Whether extension is currently executing |
| `status` | string | Current status: `idle`, `processing`, `done`, `error` |
| `blueprint` | string | Name of the blueprint file being executed |
| `currentAction` | string | Description of current action (e.g., "Creating file: app.js") |
| `progress.current` | number | Current action number (1-indexed) |
| `progress.total` | number | Total number of actions |
| `progress.percentage` | number | Progress percentage (0-100) |
| `error` | string | Error message if status is `error` |

---

## Use Cases

### 1. Automated Testing

```python
# test_blueprint.py
import requests
import time

def test_blueprint(path):
    # Execute
    requests.post('http://localhost:3000/execute', json={'path': path})
    
    # Wait for completion
    while True:
        progress = requests.get('http://localhost:3000/progress').json()
        if not progress['busy']:
            assert progress['status'] == 'done', f"Failed: {progress.get('error')}"
            break
        time.sleep(1)
    
    print(f"✅ {path} passed")

test_blueprint('/path/to/test1.json')
test_blueprint('/path/to/test2.json')
```

### 2. CI/CD Integration

```yaml
# .github/workflows/test-blueprints.yml
name: Test Blueprints

on: [push]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Start VS Code with extension
        run: code --install-extension ./json-project-builder.vsix
      - name: Test blueprints
        run: |
          for blueprint in blueprints/*.json; do
            curl -X POST http://localhost:3000/execute \
              -d "{\"path\": \"$blueprint\"}"
            
            # Wait for completion
            while true; do
              status=$(curl -s http://localhost:3000/progress | jq -r '.status')
              [ "$status" = "done" ] && break
              [ "$status" = "error" ] && exit 1
              sleep 1
            done
          done
```

### 3. Progress Bar UI

```python
from tqdm import tqdm
import requests
import time

def execute_with_progress_bar(path):
    # Start execution
    requests.post('http://localhost:3000/execute', json={'path': path})
    
    # Get total steps
    time.sleep(0.5)
    progress = requests.get('http://localhost:3000/progress').json()
    total = progress.get('progress', {}).get('total', 100)
    
    # Show progress bar
    with tqdm(total=total, desc="Executing blueprint") as pbar:
        last_step = 0
        while True:
            progress = requests.get('http://localhost:3000/progress').json()
            
            if 'progress' in progress:
                current = progress['progress']['current']
                pbar.update(current - last_step)
                last_step = current
                pbar.set_description(progress.get('currentAction', 'Processing'))
            
            if not progress['busy']:
                if progress['status'] == 'done':
                    pbar.update(total - last_step)
                    print("\n✅ Done!")
                else:
                    print(f"\n❌ Error: {progress.get('error')}")
                break
            
            time.sleep(0.5)

execute_with_progress_bar('/path/to/blueprint.json')
```

---

## Summary

The `/progress` endpoint enables:

- ✅ **Real-time monitoring** of blueprint execution
- ✅ **Automated workflows** that wait for completion
- ✅ **Progress bars** and UI updates
- ✅ **Error detection** without checking logs
- ✅ **CI/CD integration** for testing
- ✅ **Screen recording automation** with precise timing

Poll this endpoint every 1 second for smooth progress tracking!

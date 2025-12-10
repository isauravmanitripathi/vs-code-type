# Typing Speed Configuration Guide

The typing speed controls how fast text appears when the extension types code character-by-character. This is important for creating professional-looking tutorial videos.

---

## Current Default Speed

**150ms per character** (changed from 50ms for more human-like typing)

This means:
- Each character takes 0.15 seconds to type
- A 50-character line takes ~7.5 seconds
- More realistic and easier to follow in videos

---

## How to Adjust Typing Speed

### Option 1: Per Blueprint (Recommended)

Add `globalTypingSpeed` to your JSON blueprint:

```json
{
  "rootFolder": "/path/to/project",
  "globalTypingSpeed": 150,
  "actions": [
    ...
  ]
}
```

**Speed recommendations:**
- **50ms** - Very fast (original default)
- **100ms** - Fast but readable
- **150ms** - Human-like (current default) ⭐
- **200ms** - Slow and deliberate
- **300ms** - Very slow, beginner-friendly

### Option 2: Per Action

Override speed for specific actions:

```json
{
  "type": "writeText",
  "path": "src/main.rs",
  "content": "fn main() {\n    println!(\"Hello!\");\n}",
  "typingSpeed": 200
}
```

### Option 3: Change Code Default

Edit `src/extension.ts` line 411:

```typescript
const globalTypingSpeed = blueprint.globalTypingSpeed || 150;
```

Change `150` to your preferred default.

---

## Speed Comparison

| Speed (ms) | Characters/sec | 100 chars | Feel |
|------------|----------------|-----------|------|
| 50 | 20 | 5 sec | Very fast, hard to follow |
| 100 | 10 | 10 sec | Fast but readable |
| **150** | 6.7 | 15 sec | **Human-like** ⭐ |
| 200 | 5 | 20 sec | Slow, easy to follow |
| 300 | 3.3 | 30 sec | Very slow, beginner pace |

---

## Video Recording Tips

### For Tutorial Videos

Use **150-200ms** for:
- ✅ Clear, readable typing
- ✅ Viewers can follow along
- ✅ Looks professional
- ✅ Can speed up in post-production if needed

### For Demo Videos

Use **100-150ms** for:
- ✅ Faster pacing
- ✅ Still readable
- ✅ Good for experienced developers

### For Live Coding Feel

Use **200-300ms** for:
- ✅ Very realistic
- ✅ Perfect for beginners
- ✅ Matches actual typing speed

---

## Post-Production Speed Up

Record at **150-200ms**, then speed up the video:

```bash
# Speed up 1.5x (makes 150ms feel like 100ms)
ffmpeg -i input.mp4 -filter:v "setpts=0.67*PTS" -an output.mp4

# Speed up 2x (makes 200ms feel like 100ms)
ffmpeg -i input.mp4 -filter:v "setpts=0.5*PTS" -an output.mp4
```

**Benefits:**
- ✅ Smooth, natural typing in raw footage
- ✅ Flexibility to adjust speed later
- ✅ Can create multiple versions (slow for beginners, fast for experts)

---

## Example Blueprint with Custom Speed

```json
{
  "rootFolder": "/Users/yourname/tutorial-project",
  "globalTypingSpeed": 150,
  "actionDelay": 1000,
  "enableVoiceover": true,
  "actions": [
    {
      "type": "createFile",
      "path": "index.html"
    },
    {
      "type": "writeText",
      "path": "index.html",
      "content": "<!DOCTYPE html>\n<html>\n<head>\n    <title>Tutorial</title>\n</head>\n<body>\n    <h1>Hello World</h1>\n</body>\n</html>",
      "typingSpeed": 200
    },
    {
      "type": "createFile",
      "path": "script.js"
    },
    {
      "type": "writeText",
      "path": "script.js",
      "content": "console.log('Fast typing');",
      "typingSpeed": 100
    }
  ]
}
```

---

## Testing Different Speeds

Create a test blueprint:

```json
{
  "rootFolder": "/tmp/speed-test",
  "actions": [
    {
      "type": "createFile",
      "path": "test.txt"
    },
    {
      "type": "writeText",
      "path": "test.txt",
      "content": "Speed 50ms - Very fast typing",
      "typingSpeed": 50
    },
    {
      "type": "insert",
      "path": "test.txt",
      "after": "fast typing",
      "content": "\nSpeed 100ms - Fast but readable",
      "typingSpeed": 100
    },
    {
      "type": "insert",
      "path": "test.txt",
      "after": "readable",
      "content": "\nSpeed 150ms - Human-like (default)",
      "typingSpeed": 150
    },
    {
      "type": "insert",
      "path": "test.txt",
      "after": "default)",
      "content": "\nSpeed 200ms - Slow and deliberate",
      "typingSpeed": 200
    }
  ]
}
```

Execute and watch the difference!

---

## Current Configuration

**Default:** 150ms per character

**To change:**
1. Edit `src/extension.ts` line 411
2. Change the number: `|| 150`
3. Recompile: `npm run compile`
4. Restart extension

**Or** just add `globalTypingSpeed` to your blueprint JSON (no code changes needed).

---

## Summary

- ✅ **Default changed to 150ms** (from 50ms)
- ✅ More human-like, professional appearance
- ✅ Can override per blueprint or per action
- ✅ Can speed up video in post-production
- ✅ Recommended: 150-200ms for tutorials

**The slower speed makes videos look much more professional and easier to follow!** 🎬

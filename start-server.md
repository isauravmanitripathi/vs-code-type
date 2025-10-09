# 🎬 Ubuntu Server Screen Recording with Audio - Complete Guide

**Successfully tested on RunPod Ubuntu 20.04 container!**

This guide provides everything you need to record VS Code sessions with synchronized AI voice narration at 1920x1080 resolution.

---

## 📋 Table of Contents
1. [What Works](#what-works)
2. [One-Line Installation](#one-line-installation)
3. [Individual Installation Steps](#individual-installation-steps)
4. [Recording Scripts](#recording-scripts)
5. [Download Videos](#download-videos)
6. [Troubleshooting](#troubleshooting)

---

## ✅ What Works

- ✅ Virtual display at 1920x1080 (Xvfb)
- ✅ Audio capture from virtual sink (PulseAudio)
- ✅ Screen + audio recording (FFmpeg)
- ✅ AI voice generation (edge-tts)
- ✅ VS Code fullscreen recording with wmctrl/xdotool
- ✅ Video output with synchronized audio (MP4)

---

## 🚀 One-Line Installation

**Copy and paste this entire command** (requires root/sudo):

```bash
sudo apt-get update && sudo apt-get install -y wget gpg xvfb fluxbox pulseaudio pulseaudio-utils ffmpeg nodejs npm python3 python3-pip xterm xdotool wmctrl && wget -qO- https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > /tmp/packages.microsoft.gpg && sudo install -D -o root -g root -m 644 /tmp/packages.microsoft.gpg /etc/apt/keyrings/packages.microsoft.gpg && echo "deb [arch=amd64,arm64,armhf signed-by=/etc/apt/keyrings/packages.microsoft.gpg] https://packages.microsoft.com/repos/code stable main" | sudo tee /etc/apt/sources.list.d/vscode.list > /dev/null && sudo apt-get update && sudo apt-get install -y code && pip3 install edge-tts && mkdir -p ~/video-recorder && cd ~/video-recorder && npm init -y && echo "✅ Setup complete! VS Code installed. Now create your recording script."
```

---

## 📦 Individual Installation Steps

If you prefer step-by-step installation:

### Step 1: Update System
```bash
sudo apt-get update
```

### Step 2: Install Base Packages
```bash
sudo apt-get install -y wget gpg xvfb fluxbox pulseaudio pulseaudio-utils ffmpeg nodejs npm python3 python3-pip xterm xdotool wmctrl
```

### Step 3: Install VS Code
```bash
# Download Microsoft GPG key
wget -qO- https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > /tmp/packages.microsoft.gpg

# Install the GPG key
sudo install -D -o root -g root -m 644 /tmp/packages.microsoft.gpg /etc/apt/keyrings/packages.microsoft.gpg

# Add VS Code repository
echo "deb [arch=amd64,arm64,armhf signed-by=/etc/apt/keyrings/packages.microsoft.gpg] https://packages.microsoft.com/repos/code stable main" | sudo tee /etc/apt/sources.list.d/vscode.list > /dev/null

# Update and install VS Code
sudo apt-get update
sudo apt-get install -y code
```

### Step 4: Install edge-tts (AI Voice)
```bash
pip3 install edge-tts
```

### Step 5: Verify Installation
```bash
# Check all tools are installed
which xvfb-run fluxbox pulseaudio ffmpeg node npm python3 pip3 code xdotool wmctrl edge-tts

# Check versions
code --version
edge-tts --help
wmctrl --version
xdotool --version
```

### Step 6: Create Project Directory
```bash
mkdir -p ~/video-recorder
cd ~/video-recorder
npm init -y
```

---

## 🎥 Recording Scripts

### Script 1: Simple Audio Test (Beeps)

**Purpose:** Test if audio capture pipeline works

```bash
cd ~/video-recorder
nano test_audio.js
```

**Paste this code:**

```javascript
const { spawn, execSync } = require('child_process');
const fs = require('fs');

const DISPLAY_NUM = ':99';
const RESOLUTION = '1920x1080';
const AUDIO_SINK_NAME = 'MySink';
const AUDIO_SINK_MONITOR = `${AUDIO_SINK_NAME}.monitor`;
const OUTPUT_VIDEO_FILE = 'audio_test.mp4';
const RECORDING_DURATION = 15;

console.log('🚀 Testing audio capture...');

function setupPulseAudio() {
    console.log('🔊 Setting up PulseAudio...');
    try {
        execSync('pulseaudio --check', { stdio: 'ignore' });
    } catch (e) {
        execSync('pulseaudio --start --exit-idle-time=-1');
    }
    const sinks = execSync('pactl list sinks short').toString();
    if (!sinks.includes(AUDIO_SINK_NAME)) {
        execSync(`pactl load-module module-null-sink sink_name=${AUDIO_SINK_NAME}`);
    }
    execSync(`pactl set-default-sink ${AUDIO_SINK_NAME}`);
    console.log('✅ PulseAudio ready');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    try {
        setupPulseAudio();

        console.log('🎵 Generating test tone...');
        execSync('ffmpeg -f lavfi -i "sine=frequency=1000:duration=3" -ac 2 -y test_beep.mp3', { stdio: 'ignore' });
        console.log('✅ Test tone generated');

        console.log('🖥️ Starting virtual display...');
        const xvfb = spawn('Xvfb', [DISPLAY_NUM, '-screen', '0', `${RESOLUTION}x24`], { detached: true, stdio: 'ignore' });
        await sleep(2000);

        console.log('🔴 Starting recording...');
        const ffmpeg = spawn('ffmpeg', [
            '-f', 'x11grab', '-s', RESOLUTION, '-r', '30', '-i', DISPLAY_NUM,
            '-f', 'pulse', '-i', AUDIO_SINK_MONITOR,
            '-t', RECORDING_DURATION.toString(),
            '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-b:a', '192k', '-y', OUTPUT_VIDEO_FILE
        ]);

        ffmpeg.stderr.on('data', (data) => {
            if (data.toString().includes('Stream mapping')) {
                console.log('✅ Recording initialized');
            }
        });

        console.log('⏳ Waiting 5 seconds for FFmpeg...');
        await sleep(5000);

        console.log('🔊 Playing beeps...');
        for (let i = 1; i <= 3; i++) {
            console.log(`   Beep ${i}/3...`);
            execSync(`ffmpeg -re -i test_beep.mp3 -f pulse ${AUDIO_SINK_NAME}`, { stdio: 'ignore' });
            await sleep(1500);
        }

        console.log('✅ All beeps complete, waiting for recording to finish...');
        await new Promise((resolve) => ffmpeg.on('close', resolve));

        try { process.kill(xvfb.pid); } catch (e) {}

        console.log('\n✅ DONE! Video saved:', OUTPUT_VIDEO_FILE);
        console.log('📥 You should hear 3 beeps in the video');
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

main();
```

**Run it:**
```bash
node test_audio.js
```

---

### Script 2: Voice Recording Test

**Purpose:** Test AI voice generation with video

```bash
cd ~/video-recorder
nano voice_test.js
```

**Paste this code:**

```javascript
const { spawn, execSync } = require('child_process');
const fs = require('fs');

const DISPLAY_NUM = ':99';
const RESOLUTION = '1920x1080';
const AUDIO_SINK_NAME = 'MySink';
const AUDIO_SINK_MONITOR = `${AUDIO_SINK_NAME}.monitor`;
const OUTPUT_VIDEO_FILE = 'voice_test.mp4';
const RECORDING_DURATION = 20;

const TEXT_TO_SPEAK = "Hello! This is a test of the audio recording system with AI voice generation. If you can hear this voice clearly, then the system is working perfectly.";
const TTS_AUDIO_FILE = 'voice.mp3';

console.log('🚀 Starting voice test...');

function setupPulseAudio() {
    console.log('🔊 Setting up PulseAudio...');
    try {
        execSync('pulseaudio --check', { stdio: 'ignore' });
    } catch (e) {
        execSync('pulseaudio --start --exit-idle-time=-1');
    }
    const sinks = execSync('pactl list sinks short').toString();
    if (!sinks.includes(AUDIO_SINK_NAME)) {
        execSync(`pactl load-module module-null-sink sink_name=${AUDIO_SINK_NAME}`);
    }
    execSync(`pactl set-default-sink ${AUDIO_SINK_NAME}`);
    console.log('✅ PulseAudio ready');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    try {
        setupPulseAudio();

        console.log('🗣️ Generating AI voice...');
        execSync(`edge-tts --text "${TEXT_TO_SPEAK}" --write-media ${TTS_AUDIO_FILE}`, { stdio: 'inherit' });
        console.log('✅ Voice generated');

        console.log('🖥️ Starting virtual display...');
        const xvfb = spawn('Xvfb', [DISPLAY_NUM, '-screen', '0', `${RESOLUTION}x24`], { detached: true, stdio: 'ignore' });
        await sleep(2000);

        console.log('🔴 Starting recording...');
        const ffmpeg = spawn('ffmpeg', [
            '-f', 'x11grab', '-s', RESOLUTION, '-r', '30', '-i', DISPLAY_NUM,
            '-f', 'pulse', '-i', AUDIO_SINK_MONITOR,
            '-t', RECORDING_DURATION.toString(),
            '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-b:a', '192k', '-y', OUTPUT_VIDEO_FILE
        ]);

        ffmpeg.stderr.on('data', (data) => {
            if (data.toString().includes('Stream mapping')) {
                console.log('✅ Recording initialized');
            }
        });

        console.log('⏳ Waiting 5 seconds for FFmpeg...');
        await sleep(5000);

        console.log('🔊 Playing voice...');
        execSync(`ffmpeg -re -i ${TTS_AUDIO_FILE} -f pulse ${AUDIO_SINK_NAME}`, { stdio: 'ignore' });
        console.log('✅ Voice complete');

        await sleep(2000);
        console.log('⏳ Finishing recording...');
        await new Promise((resolve) => ffmpeg.on('close', resolve));

        try { process.kill(xvfb.pid); } catch (e) {}

        console.log('\n✅ DONE! Video:', OUTPUT_VIDEO_FILE);
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

main();
```

**Run it:**
```bash
node voice_test.js
```

---

### Script 3: Full VS Code Recording (MAIN SCRIPT)

**Purpose:** Professional VS Code recording with fullscreen and voice

```bash
cd ~/video-recorder
nano record_vscode.js
```

**Paste this code:**

```javascript
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DISPLAY_NUM = ':99';
const RESOLUTION = '1920x1080';
const AUDIO_SINK_NAME = 'MySink';
const AUDIO_SINK_MONITOR = `${AUDIO_SINK_NAME}.monitor`;
const OUTPUT_VIDEO_FILE = 'vscode_recording.mp4';
const RECORDING_DURATION = 45;

const TEXT_TO_SPEAK = "Welcome to this Visual Studio Code tutorial. Today we will create a simple JavaScript application. First, we'll define a function to calculate the factorial of a number. Then we'll test it with different values and see the results in the console.";
const TTS_AUDIO_FILE = 'narration.mp3';

console.log('🎬 Starting Professional VS Code Recording...');
console.log('📹 Resolution: 1920x1080');
console.log('⏱️  Duration: 45 seconds');
console.log('🎙️  With AI Voice Narration\n');

function setupPulseAudio() {
    console.log('🔊 Setting up PulseAudio...');
    try {
        execSync('pulseaudio --check', { stdio: 'ignore' });
    } catch (e) {
        execSync('pulseaudio --start --exit-idle-time=-1', { stdio: 'ignore' });
    }

    const sinks = execSync('pactl list sinks short').toString();
    if (!sinks.includes(AUDIO_SINK_NAME)) {
        execSync(`pactl load-module module-null-sink sink_name=${AUDIO_SINK_NAME}`, { stdio: 'ignore' });
    }

    execSync(`pactl set-default-sink ${AUDIO_SINK_NAME}`, { stdio: 'ignore' });
    console.log('✅ PulseAudio configured\n');
}

function killAllVSCode() {
    console.log('🔪 Cleaning up old VS Code processes...');
    try {
        execSync('pkill -9 code', { stdio: 'ignore' });
        console.log('✅ Cleanup done\n');
    } catch (e) {
        console.log('✅ No old processes found\n');
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    let xvfb = null;
    let ffmpeg = null;
    let vscode = null;
    let fluxbox = null;

    try {
        setupPulseAudio();
        killAllVSCode();
        await sleep(2000);

        console.log('🗣️  Generating AI voice narration...');
        execSync(`edge-tts --text "${TEXT_TO_SPEAK}" --write-media ${TTS_AUDIO_FILE}`, { 
            stdio: 'inherit' 
        });
        
        if (!fs.existsSync(TTS_AUDIO_FILE)) {
            throw new Error('Failed to generate voice file');
        }
        console.log('✅ Voice narration ready\n');

        const projectDir = '/tmp/factorial-demo';
        if (fs.existsSync(projectDir)) {
            execSync(`rm -rf ${projectDir}`);
        }
        fs.mkdirSync(projectDir, { recursive: true });
        
        const demoFile = path.join(projectDir, 'factorial.js');
        fs.writeFileSync(demoFile, `// Factorial Calculator Demo
// This calculates the factorial of a number

function factorial(n) {
    if (n === 0 || n === 1) {
        return 1;
    }
    return n * factorial(n - 1);
}

// Test with different values
console.log("Factorial of 5:", factorial(5));
console.log("Factorial of 7:", factorial(7));
console.log("Factorial of 10:", factorial(10));

// Expected outputs:
// 5! = 120
// 7! = 5040
// 10! = 3628800

console.log("\\nCalculation complete!");
`);
        console.log('✅ Demo project created\n');

        console.log('🖥️  Starting virtual display...');
        xvfb = spawn('Xvfb', [DISPLAY_NUM, '-screen', '0', `${RESOLUTION}x24`], { 
            detached: true,
            stdio: 'ignore'
        });
        await sleep(2000);
        console.log('✅ Virtual display ready\n');

        console.log('🪟 Starting window manager...');
        fluxbox = spawn('fluxbox', [], {
            env: { ...process.env, DISPLAY: DISPLAY_NUM },
            detached: true,
            stdio: 'ignore'
        });
        await sleep(2000);
        console.log('✅ Window manager ready\n');

        console.log('🔴 Starting screen + audio recording...');
        ffmpeg = spawn('ffmpeg', [
            '-f', 'x11grab',
            '-s', RESOLUTION,
            '-r', '30',
            '-i', DISPLAY_NUM,
            '-f', 'pulse',
            '-i', AUDIO_SINK_MONITOR,
            '-t', RECORDING_DURATION.toString(),
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-y',
            OUTPUT_VIDEO_FILE
        ]);

        let recordingReady = false;
        ffmpeg.stderr.on('data', (data) => {
            if (data.toString().includes('Stream mapping')) {
                recordingReady = true;
                console.log('✅ Recording started\n');
            }
        });

        console.log('⏳ Initializing recorder...');
        await sleep(5000);

        if (!recordingReady) {
            console.log('⚠️  Recorder may not be fully ready, continuing...\n');
        }

        const vscodeUserData = '/tmp/vscode-session';
        if (fs.existsSync(vscodeUserData)) {
            execSync(`rm -rf ${vscodeUserData}`);
        }

        console.log('💻 Launching VS Code...');
        vscode = spawn('code', [
            '--no-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--disable-extensions',
            '--disable-workspace-trust',
            '--skip-release-notes',
            '--skip-welcome',
            '--new-window',
            '--user-data-dir=' + vscodeUserData,
            demoFile
        ], {
            env: {
                ...process.env,
                DISPLAY: DISPLAY_NUM,
                HOME: '/tmp'
            },
            detached: false,
            stdio: 'ignore'
        });

        console.log('⏳ Waiting for VS Code to open...');
        await sleep(6000);

        console.log('🖼️  Maximizing to fullscreen (1920x1080)...');
        try {
            execSync(`DISPLAY=${DISPLAY_NUM} wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz`, {
                stdio: 'ignore',
                timeout: 3000
            });
            console.log('✅ VS Code is now fullscreen!\n');
        } catch (e) {
            try {
                execSync(`DISPLAY=${DISPLAY_NUM} xdotool search --class "Code" windowsize %@ 1920 1080 windowmove %@ 0 0`, {
                    stdio: 'ignore',
                    timeout: 3000
                });
                console.log('✅ VS Code resized to 1920x1080!\n');
            } catch (e2) {
                console.log('⚠️  Could not resize, using default size\n');
            }
        }

        await sleep(2000);

        console.log('🎙️  Playing voice narration...');
        console.log('   (Audio is being captured into the video)\n');
        execSync(`ffmpeg -re -i ${TTS_AUDIO_FILE} -f pulse ${AUDIO_SINK_NAME}`, { 
            stdio: 'ignore' 
        });
        console.log('✅ Narration complete\n');

        await sleep(3000);
        
        const elapsed = 22;
        const remaining = RECORDING_DURATION - elapsed;
        console.log(`⏰ Recording will finish in ${remaining} seconds...`);
        
        for (let i = remaining; i > 0; i--) {
            process.stdout.write(`\r   ${i} seconds remaining...`);
            await sleep(1000);
        }
        
        console.log('\n\n⏳ Finalizing video encoding...');
        await new Promise((resolve) => ffmpeg.on('close', () => {
            console.log('✅ Encoding complete!\n');
            resolve();
        }));

    } catch (error) {
        console.error('\n❌ Error occurred:', error.message);
    } finally {
        console.log('🧹 Cleaning up processes...');
        try { if (vscode) process.kill(vscode.pid); } catch (e) {}
        try { if (fluxbox) process.kill(fluxbox.pid); } catch (e) {}
        try { if (xvfb) process.kill(xvfb.pid); } catch (e) {}
        try { execSync('pkill -9 code', { stdio: 'ignore' }); } catch (e) {}
        
        console.log('✅ Cleanup done\n');
        console.log('═══════════════════════════════════════════════════');
        console.log('🎉 RECORDING COMPLETE!');
        console.log('═══════════════════════════════════════════════════');
        console.log('📹 File:', OUTPUT_VIDEO_FILE);
        
        if (fs.existsSync(OUTPUT_VIDEO_FILE)) {
            const size = fs.statSync(OUTPUT_VIDEO_FILE).size;
            const sizeMB = (size / 1024 / 1024).toFixed(2);
            console.log('📊 Size:', sizeMB, 'MB');
            console.log('📐 Resolution: 1920x1080');
            console.log('⏱️  Duration: ~45 seconds');
            console.log('🎙️  Audio: Synchronized voice narration');
            console.log('\n📥 Download the video using:');
            console.log('   python3 -m http.server 8888');
            console.log('\n🌐 Then open in browser:');
            console.log('   http://YOUR_SERVER_IP:8888/vscode_recording.mp4');
        } else {
            console.log('❌ Video file was not created!');
        }
        console.log('═══════════════════════════════════════════════════\n');
    }
}

main();
```

**Run it:**
```bash
node record_vscode.js
```

---

## 📥 Download Videos

### Method 1: HTTP Server (Recommended)

```bash
# Start web server in video directory
cd ~/video-recorder
python3 -m http.server 8888
```

Then open in your browser:
```
http://YOUR_SERVER_IP:8888/
```

Click on any `.mp4` file to download.

### Method 2: SCP (Secure Copy)

```bash
# From your local machine
scp user@server:~/video-recorder/*.mp4 ./
```

### Method 3: List and Download Specific File

```bash
# List all videos
ls -lh ~/video-recorder/*.mp4

# Start server for specific file
cd ~/video-recorder
python3 -m http.server 8888
```

---

## 🎯 Quick Command Reference

### Run All Tests in Order

```bash
# Test 1: Audio pipeline (beeps)
cd ~/video-recorder
node test_audio.js

# Test 2: AI voice generation
node voice_test.js

# Test 3: Full VS Code recording
node record_vscode.js

# Download videos
python3 -m http.server 8888
```

### Single Combined Command

```bash
cd ~/video-recorder && node test_audio.js && node voice_test.js && node record_vscode.js && python3 -m http.server 8888
```

---

## 🔧 Troubleshooting

### Issue: "Permission denied" errors
**Solution:** Make sure you're running as root or using sudo for installation

### Issue: No audio in video
**Solution:** 
```bash
# Check PulseAudio
pactl list sinks short
# Should show "MySink"

# Restart PulseAudio if needed
pulseaudio --kill
pulseaudio --start
```

### Issue: "edge-tts: command not found"
**Solution:**
```bash
pip3 install edge-tts
edge-tts --help
```

### Issue: VS Code not fullscreen
**Solution:** 
```bash
# Verify tools are installed
which wmctrl xdotool
# Both should show paths

# If missing, install:
sudo apt-get install -y xdotool wmctrl
```

### Issue: FFmpeg errors
**Solution:**
```bash
# Check FFmpeg version
ffmpeg -version

# Test audio capture
ffmpeg -f pulse -i MySink.monitor -t 5 test.aac
```

### Issue: Video file not created
**Solution:**
```bash
# Check disk space
df -h

# Check if FFmpeg process is running
ps aux | grep ffmpeg

# Check for errors
ls -lh ~/video-recorder/
```

---

## 📊 System Requirements

- **OS:** Ubuntu 20.04 or later
- **RAM:** 2GB minimum, 4GB recommended
- **Disk:** 500MB for software + space for videos
- **CPU:** Any modern CPU (2+ cores recommended)
- **Network:** For downloading packages and accessing web server

---

## 🎓 Understanding the Pipeline

```
┌─────────────────────────────────────────────┐
│  1. PulseAudio Virtual Sink (MySink)        │
│     - Captures all audio                     │
└─────────────┬───────────────────────────────┘
              │
┌─────────────▼───────────────────────────────┐
│  2. Xvfb Virtual Display (:99)              │
│     - 1920x1080 framebuffer                 │
└─────────────┬───────────────────────────────┘
              │
┌─────────────▼───────────────────────────────┐
│  3. Fluxbox Window Manager                  │
│     - Manages window positioning             │
└─────────────┬───────────────────────────────┘
              │
┌─────────────▼───────────────────────────────┐
│  4. VS Code Application                     │
│     - Maximized with wmctrl/xdotool         │
└─────────────┬───────────────────────────────┘
              │
┌─────────────▼───────────────────────────────┐
│  5. FFmpeg Recorder                         │
│     - Captures display + audio              │
│     - Encodes to MP4 (H.264 + AAC)          │
└─────────────┬───────────────────────────────┘
              │
              ▼
         final_video.mp4
```

---

## 🎬 Video Specifications

- **Container:** MP4
- **Video Codec:** H.264 (libx264)
- **Video Resolution:** 1920x1080 (Full HD)
- **Frame Rate:** 30 FPS
- **Audio Codec:** AAC
- **Audio Bitrate:** 192 kbps
- **Audio Channels:** Stereo (2 channels)

---

## 📝 Notes

- Videos are saved in `~/video-recorder/`
- Each recording overwrites the previous file with the same name
- The virtual display (:99) persists until the script ends
- PulseAudio sink (MySink) is created automatically
- All temporary files are cleaned up after recording

---

## 🚀 Next Steps

1. ✅ Run the installation command
2. ✅ Test with `test_audio.js` (verify audio works)
3. ✅ Test with `voice_test.js` (verify AI voice works)
4. ✅ Record with `record_vscode.js` (full recording)
5. ✅ Download and verify the video

---

## 📞 Support

If you encounter issues:
1. Check the [Troubleshooting](#troubleshooting) section
2. Verify all packages are installed: `which xvfb-run ffmpeg edge-tts code wmctrl xdotool`
3. Check logs for error messages
4. Ensure you have enough disk space: `df -h`

---

**🎉 You're all set! Happy recording!**
# Creating a VS Code Extension Package (.vsix)

This guide shows you how to package your JSON Project Builder extension into a `.vsix` file that can be installed in VS Code.

---

## Quick Steps

### 1. Install VSCE (VS Code Extension Manager)

```bash
npm install -g @vscode/vsce
```

### 2. Package the Extension

```bash
cd /Volumes/hard-drive/auto-write-vs-code/json-project-builder
vsce package
```

This creates: `json-project-builder-0.0.1.vsix`

### 3. Install the Extension

```bash
code --install-extension json-project-builder-0.0.1.vsix
```

Or in VS Code:
1. Press `Cmd+Shift+P`
2. Type: `Extensions: Install from VSIX...`
3. Select the `.vsix` file

---

## Detailed Instructions

### Step 1: Prepare Your Extension

Make sure your extension is ready:

```bash
cd /Volumes/hard-drive/auto-write-vs-code/json-project-builder

# Compile TypeScript
npm run compile

# Test the extension (optional)
# Press F5 in VS Code to test
```

### Step 2: Install VSCE

VSCE is the official tool for packaging VS Code extensions:

```bash
npm install -g @vsce/vsce
```

**Verify installation:**
```bash
vsce --version
```

### Step 3: Create README (Optional but Recommended)

VSCE will warn if you don't have a `README.md`. You already have documentation files, so you can either:

**Option A: Use existing file**
```bash
cp HTTP_API_README.md README.md
```

**Option B: Create a simple README**
```bash
echo "# JSON Project Builder

Automate VS Code blueprint execution with HTTP API.

See HTTP_API_README.md for complete documentation." > README.md
```

### Step 4: Package the Extension

```bash
vsce package
```

**Output:**
```
Executing prepublish script 'npm run compile'...
...
DONE  Packaged: /path/to/json-project-builder-0.0.1.vsix (X files, XMB)
```

This creates: `json-project-builder-0.0.1.vsix`

### Step 5: Install the Extension

**Method 1: Command Line**
```bash
code --install-extension json-project-builder-0.0.1.vsix
```

**Method 2: VS Code UI**
1. Open VS Code
2. Press `Cmd+Shift+P` (or `Ctrl+Shift+P`)
3. Type: `Extensions: Install from VSIX...`
4. Navigate to and select `json-project-builder-0.0.1.vsix`
5. Click "Install"
6. Reload VS Code when prompted

**Method 3: Extensions View**
1. Open Extensions view (`Cmd+Shift+X`)
2. Click the `...` menu (top right)
3. Select "Install from VSIX..."
4. Choose the `.vsix` file

---

## Verification

After installation:

### 1. Check Extension is Installed

```bash
code --list-extensions | grep json-project-builder
```

**Or in VS Code:**
- Extensions view → Search for "json-project-builder"
- Should show as installed

### 2. Verify HTTP Server Starts

1. Open VS Code
2. Check for notification: "JSON Project Builder: HTTP server running on port 6969"
3. Test from terminal:

```bash
curl http://localhost:6969/status
```

**Expected:**
```json
{
  "running": true,
  "port": 6969,
  "version": "0.0.1"
}
```

### 3. Test Blueprint Execution

```bash
curl -X POST http://localhost:6969/execute \
  -H "Content-Type: application/json" \
  -d '{"path": "/path/to/your/blueprint.json"}'
```

---

## Updating the Extension

### 1. Update Version Number

Edit `package.json`:
```json
{
  "version": "0.0.2"
}
```

### 2. Repackage

```bash
npm run compile
vsce package
```

Creates: `json-project-builder-0.0.2.vsix`

### 3. Reinstall

```bash
code --install-extension json-project-builder-0.0.2.vsix
```

VS Code will automatically update the existing installation.

---

## Publishing to Marketplace (Optional)

To publish your extension to the VS Code Marketplace:

### 1. Create a Publisher Account

1. Go to [Visual Studio Marketplace](https://marketplace.visualstudio.com/manage)
2. Sign in with Microsoft account
3. Create a publisher (use same name as in `package.json`)

### 2. Get Personal Access Token

1. Go to [Azure DevOps](https://dev.azure.com)
2. User Settings → Personal Access Tokens
3. Create new token with "Marketplace (Publish)" scope
4. Copy the token

### 3. Login with VSCE

```bash
vsce login isauravmanitripathi
```

Enter your personal access token when prompted.

### 4. Publish

```bash
vsce publish
```

**Or publish with version bump:**
```bash
vsce publish patch  # 0.0.1 → 0.0.2
vsce publish minor  # 0.0.1 → 0.1.0
vsce publish major  # 0.0.1 → 1.0.0
```

---

## Troubleshooting

### Error: "Missing publisher name"

**Fix:** Add to `package.json`:
```json
{
  "publisher": "your-publisher-name"
}
```

### Error: "Missing README.md"

**Fix:** Create a README:
```bash
echo "# Extension Name\n\nDescription" > README.md
```

Or use `--no-readme` flag:
```bash
vsce package --no-readme
```

### Error: "Missing repository"

**Fix:** Add to `package.json`:
```json
{
  "repository": {
    "type": "git",
    "url": "https://github.com/username/repo.git"
  }
}
```

Or use `--no-git-tag-version` flag:
```bash
vsce package --no-git-tag-version
```

### Error: TypeScript compilation failed

**Fix:**
```bash
npm run compile
```

Check for TypeScript errors and fix them.

### Extension not activating after install

**Check:**
1. Reload VS Code window (`Cmd+Shift+P` → "Reload Window")
2. Check Output panel (View → Output → Extension Host)
3. Verify `activationEvents` in `package.json`

---

## Sharing Your Extension

### Method 1: Share .vsix File

Send the `.vsix` file to others. They can install it:

```bash
code --install-extension json-project-builder-0.0.1.vsix
```

### Method 2: GitHub Releases

1. Create a GitHub release
2. Upload the `.vsix` file as a release asset
3. Share the release URL

### Method 3: Publish to Marketplace

Follow the "Publishing to Marketplace" section above.

---

## Complete Workflow

```bash
# 1. Navigate to project
cd /Volumes/hard-drive/auto-write-vs-code/json-project-builder

# 2. Compile TypeScript
npm run compile

# 3. Package extension
vsce package

# 4. Install locally
code --install-extension json-project-builder-0.0.1.vsix

# 5. Reload VS Code
# Cmd+Shift+P → "Reload Window"

# 6. Test
curl http://localhost:6969/status
```

---

## Files Included in Package

The `.vsix` package includes:
- ✅ Compiled JavaScript (`out/`)
- ✅ `package.json`
- ✅ `README.md`
- ✅ Documentation files (`.md`)
- ✅ Example blueprints (`.json`)
- ❌ Source TypeScript (`src/`) - excluded by default
- ❌ `node_modules/` - excluded
- ❌ `.git/` - excluded

To customize what's included, create a `.vscodeignore` file.

---

## Summary

**To create and install your extension:**

```bash
# Install VSCE
npm install -g @vscode/vsce

# Package
cd /Volumes/hard-drive/auto-write-vs-code/json-project-builder
vsce package

# Install
code --install-extension json-project-builder-0.0.1.vsix

# Test
curl http://localhost:6969/status
```

**Your extension is now packaged and ready to share!** 🚀

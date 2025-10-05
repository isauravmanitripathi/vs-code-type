import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
const playSound = require('play-sound');

const execAsync = promisify(exec);
const player = playSound({});

interface Action {
  type: 'createFolder' | 'createFile' | 'openFile' | 'writeText' | 'deleteLine' | 'insertAt' | 'replaceText';
  path?: string;
  content?: string;
  line?: number;
  position?: number;
  find?: string;
  replace?: string;
  typingSpeed?: number;
  voiceover?: string; // Text to speak
  voice?: string; // Voice to use (optional, default: en-US-AriaNeural)
}

interface Blueprint {
  rootFolder: string;
  actions: Action[];
  globalTypingSpeed?: number;
  actionDelay?: number;
  defaultVoice?: string; // Default voice for all voiceovers
  enableVoiceover?: boolean; // Master switch for voiceover (default: true)
}

let audioContext: any = null;

export function activate(context: vscode.ExtensionContext) {
  console.log('JSON Project Builder is now active!');

  let disposable = vscode.commands.registerCommand('json-project-builder.buildFromJson', async () => {
    // Ask user to select a JSON file
    const fileUri = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { 'JSON Files': ['json'] },
      openLabel: 'Select Blueprint JSON'
    });

    if (!fileUri || fileUri.length === 0) {
      vscode.window.showErrorMessage('No file selected');
      return;
    }

    // Read and parse the JSON file
    const jsonPath = fileUri[0].fsPath;
    let blueprint: Blueprint;

    try {
      const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
      blueprint = JSON.parse(jsonContent);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to parse JSON: ${error}`);
      return;
    }

    // Get workspace folder
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder open');
      return;
    }

    const baseDir = path.join(workspaceFolder.uri.fsPath, blueprint.rootFolder);

    // Create root folder if it doesn't exist
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    const globalTypingSpeed = blueprint.globalTypingSpeed || 50;
    const actionDelay = blueprint.actionDelay || 800;
    const defaultVoice = blueprint.defaultVoice || 'en-US-AriaNeural';
    const enableVoiceover = blueprint.enableVoiceover !== false; // Default true

    // Create temp directory for audio files
    const tempDir = path.join(os.tmpdir(), 'vscode-tutorial-audio');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Execute actions with visual feedback
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.show();

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "Building project from blueprint",
      cancellable: false
    }, async (progress) => {
      const totalActions = blueprint.actions.length;

      for (let i = 0; i < blueprint.actions.length; i++) {
        const action = blueprint.actions[i];
        const actionName = getActionDescription(action);
        
        statusBarItem.text = `🔨 ${actionName}`;
        progress.report({
          message: `Step ${i + 1}/${totalActions}: ${actionName}`,
          increment: (100 / totalActions)
        });

        try {
          // Play voiceover BEFORE action if enabled
          if (enableVoiceover && action.voiceover) {
            statusBarItem.text = `🔊 ${action.voiceover.substring(0, 50)}...`;
            await playVoiceover(action.voiceover, action.voice || defaultVoice, tempDir);
          }

          // Execute the action
          await executeAction(action, baseDir, globalTypingSpeed);
          
          // Delay between actions
          await delay(actionDelay);
        } catch (error) {
          statusBarItem.dispose();
          vscode.window.showErrorMessage(`Error at step ${i + 1}: ${error}`);
          return;
        }
      }

      statusBarItem.dispose();
    });

    // Cleanup temp audio files
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }

    vscode.window.showInformationMessage('✅ Tutorial completed successfully!');
  });

  context.subscriptions.push(disposable);
}

async function playVoiceover(text: string, voice: string, tempDir: string): Promise<void> {
  try {
    console.log('Speaking:', text.substring(0, 50) + '...');
    
    // Use macOS 'say' command for immediate playback (no file needed!)
    if (process.platform === 'darwin') {
      await macOSSay(text, voice);
    } else {
      // For other platforms, try edge-tts with full path
      await edgeTTSPlayback(text, voice, tempDir);
    }
    
    console.log('Voiceover completed');
    
    // Small delay after audio
    await delay(300);
    
  } catch (error) {
    console.error('Voiceover error:', error);
    // Continue even if voiceover fails
  }
}

async function macOSSay(text: string, voice: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // macOS built-in text-to-speech - works immediately, no files needed
    // Map some common voice names to macOS voices
    let macVoice = 'Samantha'; // default female voice
    
    if (voice.includes('Guy') || voice.includes('Male')) {
      macVoice = 'Alex'; // male voice
    } else if (voice.includes('Aria') || voice.includes('Female')) {
      macVoice = 'Samantha'; // female voice
    }
    
    const command = `say -v "${macVoice}" "${text.replace(/"/g, '\\"')}"`;
    
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('macOS say error:', error);
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

async function edgeTTSPlayback(text: string, voice: string, tempDir: string): Promise<void> {
  const audioFile = path.join(tempDir, `audio_${Date.now()}.mp3`);
  
  try {
    // Try common edge-tts installation paths
    const possiblePaths = [
      'edge-tts', // Try default first
      '/opt/homebrew/bin/edge-tts',
      '/usr/local/bin/edge-tts',
      '/opt/homebrew/Caskroom/miniconda/base/bin/edge-tts',
      `${process.env.HOME}/.local/bin/edge-tts`,
      `${process.env.HOME}/miniconda3/bin/edge-tts`,
      `${process.env.HOME}/anaconda3/bin/edge-tts`
    ];
    
    let edgeTTSPath = 'edge-tts';
    
    // Find working edge-tts path
    for (const p of possiblePaths) {
      try {
        await execAsync(`which ${p}`);
        edgeTTSPath = p;
        console.log('Found edge-tts at:', p);
        break;
      } catch (e) {
        continue;
      }
    }
    
    const ttsCommand = `${edgeTTSPath} --voice "${voice}" --text "${text.replace(/"/g, '\\"')}" --write-media "${audioFile}"`;
    
    console.log('Generating audio with command:', ttsCommand);
    
    const { stdout, stderr } = await execAsync(ttsCommand);
    
    if (stderr) {
      console.log('TTS stderr:', stderr);
    }
    
    await delay(200);
    
    if (!fs.existsSync(audioFile)) {
      throw new Error('Audio file was not created');
    }
    
    console.log('Playing audio file:', audioFile);
    await playAudioFile(audioFile);
    
  } finally {
    try {
      if (fs.existsSync(audioFile)) {
        fs.unlinkSync(audioFile);
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

async function playAudioFile(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('Attempting to play audio:', filePath);
    
    // Check if file exists and has size
    const stats = fs.statSync(filePath);
    console.log('Audio file size:', stats.size, 'bytes');
    
    if (stats.size === 0) {
      console.error('Audio file is empty!');
      resolve();
      return;
    }
    
    // Use play-sound library which handles cross-platform audio
    player.play(filePath, (err: any) => {
      if (err) {
        console.error('Error playing audio:', err);
        // Try fallback to system command
        fallbackPlayAudio(filePath).then(resolve).catch(() => resolve());
      } else {
        console.log('Audio finished playing');
        resolve();
      }
    });
  });
}

async function fallbackPlayAudio(filePath: string): Promise<void> {
  console.log('Using fallback audio playback');
  return new Promise((resolve) => {
    let command: string;
    
    if (process.platform === 'darwin') {
      command = `afplay "${filePath}"`;
    } else if (process.platform === 'win32') {
      command = `powershell -c "(New-Object Media.SoundPlayer '${filePath}').PlaySync()"`;
    } else {
      command = `mpg123 "${filePath}" 2>/dev/null || ffplay -nodisp -autoexit "${filePath}" 2>/dev/null`;
    }
    
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('Fallback audio error:', error);
      }
      resolve();
    });
  });
}

function getActionDescription(action: Action): string {
  switch (action.type) {
    case 'createFolder':
      return `Creating folder: ${action.path}`;
    case 'createFile':
      return `Creating file: ${action.path}`;
    case 'openFile':
      return `Opening: ${action.path}`;
    case 'writeText':
      return `Writing text...`;
    case 'deleteLine':
      return `Deleting line ${action.line}`;
    case 'insertAt':
      return `Inserting at line ${action.line}`;
    case 'replaceText':
      return `Replacing: ${action.find}`;
    default:
      return action.type;
  }
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function typeText(editor: vscode.TextEditor, text: string, speed: number): Promise<void> {
  for (const char of text) {
    await editor.edit(editBuilder => {
      const position = editor.selection.active;
      editBuilder.insert(position, char);
    });
    
    const newPosition = editor.selection.active;
    editor.selection = new vscode.Selection(newPosition, newPosition);
    
    await delay(speed);
  }
}

async function executeAction(action: Action, baseDir: string, globalTypingSpeed: number): Promise<void> {
  const typingSpeed = action.typingSpeed || globalTypingSpeed;

  switch (action.type) {
    case 'createFolder':
      if (!action.path) throw new Error('createFolder requires path');
      
      await vscode.commands.executeCommand('workbench.view.explorer');
      await delay(300);
      
      const folderPath = path.join(baseDir, action.path);
      
      const parentPath = path.dirname(folderPath);
      if (fs.existsSync(parentPath)) {
        const parentUri = vscode.Uri.file(parentPath);
        await vscode.commands.executeCommand('revealInExplorer', parentUri);
        await delay(400);
      }
      
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
        
        const folderUri = vscode.Uri.file(folderPath);
        await vscode.commands.executeCommand('revealInExplorer', folderUri);
        await delay(700);
      }
      break;

    case 'createFile':
      if (!action.path) throw new Error('createFile requires path');
      
      await vscode.commands.executeCommand('workbench.view.explorer');
      await delay(300);
      
      const filePath = path.join(baseDir, action.path);
      const fileDir = path.dirname(filePath);
      
      if (fs.existsSync(fileDir)) {
        const dirUri = vscode.Uri.file(fileDir);
        await vscode.commands.executeCommand('revealInExplorer', dirUri);
        await delay(400);
      } else {
        fs.mkdirSync(fileDir, { recursive: true });
      }
      
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, '');
        
        const fileUri = vscode.Uri.file(filePath);
        await vscode.commands.executeCommand('revealInExplorer', fileUri);
        await delay(700);
      }
      break;

    case 'openFile':
      if (!action.path) throw new Error('openFile requires path');
      const openPath = path.join(baseDir, action.path);
      const doc = await vscode.workspace.openTextDocument(openPath);
      await vscode.window.showTextDocument(doc);
      await delay(500);
      break;

    case 'writeText':
      if (!action.content) throw new Error('writeText requires content');
      const editor = vscode.window.activeTextEditor;
      if (!editor) throw new Error('No active editor');
      
      await typeText(editor, action.content, typingSpeed);
      break;

    case 'insertAt':
      if (!action.content || action.line === undefined) {
        throw new Error('insertAt requires content and line');
      }
      const insertEditor = vscode.window.activeTextEditor;
      if (!insertEditor) throw new Error('No active editor');
      
      const position = new vscode.Position(action.line, 0);
      insertEditor.selection = new vscode.Selection(position, position);
      await delay(200);
      
      await typeText(insertEditor, action.content + '\n', typingSpeed);
      break;

    case 'deleteLine':
      if (action.line === undefined) throw new Error('deleteLine requires line');
      const deleteEditor = vscode.window.activeTextEditor;
      if (!deleteEditor) throw new Error('No active editor');
      
      const line = deleteEditor.document.lineAt(action.line);
      deleteEditor.selection = new vscode.Selection(
        line.range.start,
        line.range.end
      );
      await delay(500);
      
      await deleteEditor.edit(editBuilder => {
        editBuilder.delete(line.rangeIncludingLineBreak);
      });
      break;

    case 'replaceText':
      if (!action.find || action.replace === undefined) {
        throw new Error('replaceText requires find and replace');
      }
      const replaceEditor = vscode.window.activeTextEditor;
      if (!replaceEditor) throw new Error('No active editor');
      
      const text = replaceEditor.document.getText();
      
      const index = text.indexOf(action.find);
      if (index !== -1) {
        const startPos = replaceEditor.document.positionAt(index);
        const endPos = replaceEditor.document.positionAt(index + action.find.length);
        replaceEditor.selection = new vscode.Selection(startPos, endPos);
        replaceEditor.revealRange(new vscode.Range(startPos, endPos));
        await delay(800);
      }
      
      const newText = text.replace(new RegExp(action.find, 'g'), action.replace);
      
      await replaceEditor.edit(editBuilder => {
        const firstLine = replaceEditor.document.lineAt(0);
        const lastLine = replaceEditor.document.lineAt(replaceEditor.document.lineCount - 1);
        const range = new vscode.Range(firstLine.range.start, lastLine.range.end);
        editBuilder.replace(range, newText);
      });
      break;

    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

export function deactivate() {}
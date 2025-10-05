import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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
  const audioFile = path.join(tempDir, `audio_${Date.now()}.mp3`);
  
  try {
    // Generate audio using edge-tts
    const ttsCommand = `edge-tts --voice "${voice}" --text "${text.replace(/"/g, '\\"')}" --write-media "${audioFile}"`;
    
    console.log('Generating audio:', text.substring(0, 50) + '...');
    
    // Generate the audio file
    const { stdout, stderr } = await execAsync(ttsCommand);
    
    if (stderr) {
      console.log('TTS stderr:', stderr);
    }
    
    // Wait a bit to ensure file is written
    await delay(200);
    
    // Check if file exists
    if (!fs.existsSync(audioFile)) {
      console.error('Audio file was not created:', audioFile);
      return;
    }
    
    console.log('Playing audio file:', audioFile);
    
    // Play the audio file (this will now wait until playback completes)
    await playAudioFile(audioFile);
    
    console.log('Audio playback completed');
    
    // Small delay after audio
    await delay(300);
    
  } catch (error) {
    console.error('Voiceover error:', error);
    // Continue even if voiceover fails
  } finally {
    // Clean up the audio file
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
    let command: string;
    
    // Determine the command based on OS
    if (process.platform === 'darwin') {
      // macOS - afplay blocks until audio finishes
      command = `afplay "${filePath}"`;
    } else if (process.platform === 'win32') {
      // Windows - use powershell with PlaySync (blocks)
      command = `powershell -c "(New-Object Media.SoundPlayer '${filePath}').PlaySync()"`;
    } else {
      // Linux - these commands block until audio finishes
      command = `mpg123 "${filePath}" 2>/dev/null || ffplay -nodisp -autoexit "${filePath}" 2>/dev/null || aplay "${filePath}" 2>/dev/null`;
    }
    
    // Use child_process.spawn for better control
    const child = exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('Audio playback error:', error);
        console.error('stderr:', stderr);
      }
      // Resolve after command completes
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
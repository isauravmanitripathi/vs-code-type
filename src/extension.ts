import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AudioHandler } from './audioHandler';

interface Action {
  type: 'createFolder' | 'createFile' | 'openFile' | 'writeText' | 'insert' | 'delete' | 'replace';
  path?: string;
  content?: string;
  
  // Location selectors
  after?: string;
  before?: string;
  at?: number;
  find?: string;
  
  // Context for disambiguation
  near?: string;
  inside?: string;
  occurrence?: number;
  
  // Replace
  with?: string;
  
  // Options
  typingSpeed?: number;
  voiceover?: string;
  voice?: string;
  voiceoverTiming?: 'before' | 'after' | 'during';
}

interface Blueprint {
  rootFolder: string;
  actions: Action[];
  globalTypingSpeed?: number;
  actionDelay?: number;
  defaultVoice?: string;
  enableVoiceover?: boolean;
}

let audioHandler: AudioHandler;

export function activate(context: vscode.ExtensionContext) {
  console.log('JSON Project Builder is now active!');

  audioHandler = new AudioHandler();

  let disposable = vscode.commands.registerCommand('json-project-builder.buildFromJson', async () => {
    const fileUri = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { 'JSON Files': ['json'] },
      openLabel: 'Select Blueprint JSON'
    });

    if (!fileUri || fileUri.length === 0) {
      vscode.window.showErrorMessage('No file selected');
      return;
    }

    const jsonPath = fileUri[0].fsPath;
    let blueprint: Blueprint;

    try {
      const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
      blueprint = JSON.parse(jsonContent);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to parse JSON: ${error}`);
      return;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder open');
      return;
    }

    const baseDir = path.join(workspaceFolder.uri.fsPath, blueprint.rootFolder);

    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    const globalTypingSpeed = blueprint.globalTypingSpeed || 50;
    const actionDelay = blueprint.actionDelay || 800;
    const defaultVoice = blueprint.defaultVoice || 'en-US-AriaNeural';
    const enableVoiceover = blueprint.enableVoiceover !== false;

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
          const voiceoverTiming = action.voiceover ? (action.voiceoverTiming || 'before') : null;
          const voiceToUse = action.voice || defaultVoice;

          if (enableVoiceover && voiceoverTiming === 'before') {
            statusBarItem.text = `🔊 ${action.voiceover!.substring(0, 50)}...`;
            await audioHandler.playVoiceover(action.voiceover!, voiceToUse, 'before');
          }

          let duringAudioPromise: Promise<void> | null = null;
          if (enableVoiceover && voiceoverTiming === 'during') {
            statusBarItem.text = `🔊 ${action.voiceover!.substring(0, 50)}...`;
            duringAudioPromise = audioHandler.playVoiceover(action.voiceover!, voiceToUse, 'during');
            await delay(100);
          }

          await executeAction(action, baseDir, globalTypingSpeed);

          if (enableVoiceover && voiceoverTiming === 'after') {
            statusBarItem.text = `🔊 ${action.voiceover!.substring(0, 50)}...`;
            await audioHandler.playVoiceover(action.voiceover!, voiceToUse, 'after');
          }

          if (duringAudioPromise) {
            await duringAudioPromise;
          }
          
          await delay(actionDelay);
        } catch (error) {
          statusBarItem.dispose();
          vscode.window.showErrorMessage(`Error at step ${i + 1}: ${error}`);
          return;
        }
      }

      statusBarItem.dispose();
    });

    vscode.window.showInformationMessage('✅ Tutorial completed successfully!');
  });

  context.subscriptions.push(disposable);
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
    case 'insert':
      if (action.after) return `Inserting after: ${action.after.substring(0, 30)}...`;
      if (action.before) return `Inserting before: ${action.before.substring(0, 30)}...`;
      if (action.at !== undefined) return `Inserting at line ${action.at}`;
      return `Inserting code...`;
    case 'delete':
      return `Deleting: ${action.find?.substring(0, 30)}...`;
    case 'replace':
      return `Replacing: ${action.find?.substring(0, 30)}...`;
    default:
      return action.type;
  }
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * FIXED: Type text character by character, properly handling escape sequences
 */
async function typeText(editor: vscode.TextEditor, text: string, speed: number): Promise<void> {
  // Process escape sequences BEFORE iterating character by character
  // This converts JSON strings like "line1\n    line2" into actual newlines and spaces
  const processedText = text
    .replace(/\\n/g, '\n')  // Convert \n to actual newline
    .replace(/\\t/g, '\t')  // Convert \t to actual tab
    .replace(/\\r/g, '\r')  // Convert \r to carriage return
    .replace(/\\\\/g, '\\'); // Convert \\ to single backslash
  
  for (const char of processedText) {
    await vscode.commands.executeCommand('type', { text: char });
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

    case 'insert':
      await handleInsert(action, typingSpeed);
      break;

    case 'delete':
      await handleDelete(action);
      break;

    case 'replace':
      await handleReplace(action, typingSpeed);
      break;

    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

/**
 * Handle insert action with smart location finding
 */
async function handleInsert(action: Action, typingSpeed: number): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !action.content) {
    throw new Error('No active editor or content missing');
  }

  // Insert after a pattern
  if (action.after) {
    await insertAfterPattern(editor, action, typingSpeed);
    return;
  }

  // Insert before a pattern
  if (action.before) {
    await insertBeforePattern(editor, action, typingSpeed);
    return;
  }

  // Insert at specific line
  if (action.at !== undefined) {
    await insertAtLine(editor, action, typingSpeed);
    return;
  }

  throw new Error('Insert action requires "after", "before", or "at" property');
}

/**
 * Insert after a pattern - simulates pressing Enter at end of line
 * Content should NOT have leading newline or spaces - VS Code auto-indents!
 */
async function insertAfterPattern(
  editor: vscode.TextEditor,
  action: Action,
  typingSpeed: number
): Promise<void> {
  const document = editor.document;
  
  // Find the line with the pattern
  const lineResult = findPattern(document, action.after!, action.near, action.inside, action.occurrence);
  
  if (!lineResult) {
    throw new Error(`Pattern not found: "${action.after}"${action.near ? ` near "${action.near}"` : ''}`);
  }

  const line = document.lineAt(lineResult.line);
  
  // Move cursor to END of the line
  const endPosition = line.range.end;
  editor.selection = new vscode.Selection(endPosition, endPosition);
  
  // Reveal the line
  editor.revealRange(
    new vscode.Range(endPosition, endPosition),
    vscode.TextEditorRevealType.InCenter
  );
  
  await delay(300);

  // Press Enter - VS Code auto-indents based on the line above!
  await vscode.commands.executeCommand('type', { text: '\n' });
  await delay(100);

  // Type the content - it should NOT have leading spaces!
  // VS Code already indented after pressing Enter
  await typeText(editor, action.content!, typingSpeed);
}

/**
 * Insert before a pattern - simulates creating a new line above
 * Content should NOT have leading newline or spaces
 */
async function insertBeforePattern(
  editor: vscode.TextEditor,
  action: Action,
  typingSpeed: number
): Promise<void> {
  const document = editor.document;
  
  // Find the line with the pattern
  const lineResult = findPattern(document, action.before!, action.near, action.inside, action.occurrence);
  
  if (!lineResult) {
    throw new Error(`Pattern not found: "${action.before}"${action.near ? ` near "${action.near}"` : ''}`);
  }

  const line = document.lineAt(lineResult.line);
  
  // Move cursor to START of the line
  const startPosition = line.range.start;
  editor.selection = new vscode.Selection(startPosition, startPosition);
  
  // Reveal the line
  editor.revealRange(
    new vscode.Range(startPosition, startPosition),
    vscode.TextEditorRevealType.InCenter
  );
  
  await delay(300);

  // Type the content first (without leading spaces)
  await typeText(editor, action.content!, typingSpeed);
  
  // Then press Enter to move the original line down
  await vscode.commands.executeCommand('type', { text: '\n' });
  await delay(100);
}

/**
 * Insert at specific line number
 */
async function insertAtLine(
  editor: vscode.TextEditor,
  action: Action,
  typingSpeed: number
): Promise<void> {
  const document = editor.document;
  const lineNumber = Math.max(0, Math.min(action.at!, document.lineCount - 1));
  const line = document.lineAt(lineNumber);
  
  // Move cursor to start of line
  const position = line.range.start;
  editor.selection = new vscode.Selection(position, position);
  
  editor.revealRange(
    new vscode.Range(position, position),
    vscode.TextEditorRevealType.InCenter
  );
  
  await delay(300);

  // Type content
  await typeText(editor, action.content!, typingSpeed);
  
  // Press Enter
  await vscode.commands.executeCommand('type', { text: '\n' });
  await delay(100);
}

/**
 * Handle delete action
 */
async function handleDelete(action: Action): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !action.find) {
    throw new Error('No active editor or find pattern missing');
  }

  const document = editor.document;
  const text = document.getText();
  
  // Find the text to delete
  const index = text.indexOf(action.find);
  if (index === -1) {
    throw new Error(`Text not found: "${action.find}"`);
  }

  // Select the text
  const startPos = document.positionAt(index);
  const endPos = document.positionAt(index + action.find.length);
  
  editor.selection = new vscode.Selection(startPos, endPos);
  editor.revealRange(new vscode.Range(startPos, endPos));
  
  await delay(500);

  // Delete it
  await editor.edit(editBuilder => {
    editBuilder.delete(new vscode.Range(startPos, endPos));
  });
}

/**
 * Handle replace action
 */
async function handleReplace(action: Action, typingSpeed: number): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !action.find || action.with === undefined) {
    throw new Error('No active editor or find/with pattern missing');
  }

  const document = editor.document;
  const text = document.getText();
  
  // Find the text to replace
  const index = text.indexOf(action.find);
  if (index === -1) {
    throw new Error(`Text not found: "${action.find}"`);
  }

  // Select the text
  const startPos = document.positionAt(index);
  const endPos = document.positionAt(index + action.find.length);
  
  editor.selection = new vscode.Selection(startPos, endPos);
  editor.revealRange(new vscode.Range(startPos, endPos));
  
  await delay(800);

  // Replace it
  await editor.edit(editBuilder => {
    editBuilder.replace(new vscode.Range(startPos, endPos), action.with!);
  });
}

/**
 * Find a pattern in the document with context awareness
 */
function findPattern(
  document: vscode.TextDocument,
  pattern: string,
  near?: string,
  inside?: string,
  occurrence?: number
): { line: number; character: number } | null {
  
  const text = document.getText();
  const lines = text.split('\n');
  
  // Find all matches of the pattern
  const matches: { line: number; character: number }[] = [];
  
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const lineText = lines[lineNum];
    const index = lineText.indexOf(pattern);
    
    if (index !== -1) {
      matches.push({ line: lineNum, character: index });
    }
  }

  if (matches.length === 0) {
    return null;
  }

  // If only one match, return it
  if (matches.length === 1) {
    return matches[0];
  }

  // Filter by context if provided
  let filteredMatches = matches;

  if (near || inside) {
    const contextPattern = near || inside;
    filteredMatches = matches.filter(match => {
      // Search within +/- 20 lines for context
      const startLine = Math.max(0, match.line - 20);
      const endLine = Math.min(lines.length - 1, match.line + 20);
      
      for (let i = startLine; i <= endLine; i++) {
        if (lines[i].indexOf(contextPattern!) !== -1) {
          return true;
        }
      }
      return false;
    });
  }

  if (filteredMatches.length === 0) {
    return null;
  }

  // Return the Nth occurrence (default to first)
  const index = Math.min((occurrence || 1) - 1, filteredMatches.length - 1);
  return filteredMatches[index];
}

export function deactivate() {
  if (audioHandler) {
    audioHandler.cleanup();
  }
}
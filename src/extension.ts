import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AudioHandler } from './audioHandler';

interface Action {
  type: 'createFolder' | 'createFile' | 'openFile' | 'writeText' | 'insert' | 'delete' | 'replace' | 'highlight';
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
    case 'highlight':
      return `Highlighting in: ${action.path} - ${action.find?.substring(0, 30)}...`;
    default:
      return action.type;
  }
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Detect indentation of a line (spaces or tabs)
 */
function detectIndentation(lineText: string): { char: string; count: number; total: string } {
  const match = lineText.match(/^(\s+)/);
  if (!match) {
    return { char: ' ', count: 0, total: '' };
  }
  
  const whitespace = match[1];
  const hasTab = whitespace.includes('\t');
  
  if (hasTab) {
    const tabCount = (whitespace.match(/\t/g) || []).length;
    return { char: '\t', count: tabCount, total: whitespace };
  } else {
    return { char: ' ', count: whitespace.length, total: whitespace };
  }
}

/**
 * Get the target indentation for a new insertion after/before/at a given line
 * For Python: If after a ':' line, increase. Else, find the sibling level by scanning up to the block opener.
 */
function getTargetIndent(document: vscode.TextDocument, targetLine: number): string {
  if (targetLine < 0 || targetLine >= document.lineCount) {
    return '';
  }

  const line = document.lineAt(targetLine);
  const indentObj = detectIndentation(line.text);
  let currentTotal = indentObj.total;
  const currentCount = indentObj.count;
  const indentChar = indentObj.char;
  const levelSize = indentChar === '\t' ? 1 : 4;

  const trimmed = line.text.trim();
  const languageId = document.languageId;
  
  // If the line ends with a block opener like :, increase indentation
  if (languageId === 'python' && trimmed.endsWith(':')) {
    return currentTotal + indentChar.repeat(levelSize);
  }

  // Otherwise, find the enclosing block's opener indent (sibling level)
  // Scan upwards for a line with smaller indent
  let scanLine = targetLine - 1;
  while (scanLine >= 0) {
    const prevLine = document.lineAt(scanLine);
    const prevIndentObj = detectIndentation(prevLine.text);
    if (prevIndentObj.count < currentCount) {
      // Found the opener's indent level
      return prevIndentObj.total;
    }
    scanLine--;
  }

  // No enclosing block found, use root level (0)
  return '';
}

/**
 * Normalize content indentation based on target indentation
 * Strips common leading whitespace and re-applies target + relative prefixes
 */
function normalizeIndentation(content: string, targetIndent: string): string {
  const lines = content.split('\n');
  if (lines.length === 0) {
    return content;
  }

  // Find the minimum prefix among non-empty lines
  let minPrefix: string | null = null;
  for (const line of lines) {
    if (line.trim().length > 0) {
      const prefixMatch = line.match(/^\s*/);
      const prefix = prefixMatch ? prefixMatch[0] : '';
      if (minPrefix === null || prefix.length < minPrefix!.length) {
        minPrefix = prefix;
      }
    }
  }

  if (minPrefix === null) {
    minPrefix = '';
  }

  // Normalize each line
  const normalizedLines: string[] = [];
  for (const line of lines) {
    const prefixMatch = line.match(/^\s*/);
    const prefix = prefixMatch ? prefixMatch[0] : '';
    const relativePrefix = prefix.substring(minPrefix.length);
    const contentPart = line.trimStart();
    normalizedLines.push(targetIndent + relativePrefix + contentPart);
  }

  return normalizedLines.join('\n');
}

/**
 * Type text character by character using direct edits for animation
 * Handles newline specially to place cursor correctly
 */
async function typeText(editor: vscode.TextEditor, text: string, speed: number): Promise<void> {
  const startPosition = editor.selection.active;
  
  for (const char of text) {
    const currentPos = editor.selection.active;
    
    await editor.edit(editBuilder => {
      editBuilder.insert(currentPos, char);
    }, {
      undoStopBefore: false,
      undoStopAfter: false
    });
    
    // Move cursor forward, special case for newline
    let newPos: vscode.Position;
    if (char === '\n') {
      newPos = new vscode.Position(currentPos.line + 1, 0);
    } else {
      newPos = currentPos.translate(0, 1);
    }
    editor.selection = new vscode.Selection(newPos, newPos);
    
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

    case 'highlight':
      await handleHighlight(action, baseDir);
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
 * Handle highlight action: open file, find and select pattern, reveal, then voiceover
 */
async function handleHighlight(action: Action, baseDir: string): Promise<void> {
  if (!action.path || !action.find || !action.voiceover) {
    throw new Error('highlight requires path, find, and voiceover');
  }

  // Open the file
  const highlightPath = path.join(baseDir, action.path);
  const doc = await vscode.workspace.openTextDocument(highlightPath);
  await vscode.window.showTextDocument(doc);
  await delay(500);

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    throw new Error('No active editor after opening file');
  }

  const document = editor.document;

  // Find the pattern
  const lineResult = findPattern(document, action.find, action.near, action.inside, action.occurrence);
  
  if (!lineResult) {
    throw new Error(`Pattern not found for highlight: "${action.find}"${action.near ? ` near "${action.near}"` : ''}`);
  }

  // For simplicity, highlight the entire line containing the pattern
  const line = document.lineAt(lineResult.line);
  const startPos = line.range.start;
  const endPos = line.range.end;

  // Select and reveal the highlighted range
  editor.selection = new vscode.Selection(startPos, endPos);
  editor.revealRange(
    new vscode.Range(startPos, endPos),
    vscode.TextEditorRevealType.InCenter
  );

  await delay(300); // Pause to show the highlight
}

/**
 * Insert after a pattern - uses direct edit with proper indentation detection
 */
async function insertAfterPattern(
  editor: vscode.TextEditor,
  action: Action,
  typingSpeed: number
): Promise<void> {
  const document = editor.document;
  
  // Find the line with the pattern (fuzzy match - trim whitespace)
  const lineResult = findPattern(document, action.after!, action.near, action.inside, action.occurrence);
  
  if (!lineResult) {
    throw new Error(`Pattern not found: "${action.after}"${action.near ? ` near "${action.near}"` : ''}`);
  }

  const line = document.lineAt(lineResult.line);
  const endPosition = line.range.end;
  
  // Reveal the line
  editor.selection = new vscode.Selection(endPosition, endPosition);
  editor.revealRange(
    new vscode.Range(endPosition, endPosition),
    vscode.TextEditorRevealType.InCenter
  );
  
  await delay(300);

  // Get target indentation for the new content
  const targetIndent = getTargetIndent(document, lineResult.line);
  
  // Normalize the content based on target indentation
  const normalizedContent = normalizeIndentation(action.content!, targetIndent);
  
  // Insert newline first using direct edit
  await editor.edit(editBuilder => {
    editBuilder.insert(endPosition, '\n');
  });
  
  await delay(100);
  
  // Get the new cursor position (start of the new line) - robust way after edit
  const newLineNum = endPosition.line + 1;
  const newLine = editor.document.lineAt(newLineNum);
  const newLinePosition = newLine.range.start;
  editor.selection = new vscode.Selection(newLinePosition, newLinePosition);
  
  // Now type the normalized content with animation at the new position
  await typeText(editor, normalizedContent, typingSpeed);
}

/**
 * Insert before a pattern - uses direct edit
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
  const startPosition = line.range.start;
  
  // Target indent is the same as the target line's indent
  const targetIndent = detectIndentation(line.text).total;
  const normalizedContent = normalizeIndentation(action.content!, targetIndent);
  
  // Reveal the line
  editor.selection = new vscode.Selection(startPosition, startPosition);
  editor.revealRange(
    new vscode.Range(startPosition, startPosition),
    vscode.TextEditorRevealType.InCenter
  );
  
  await delay(300);

  // Type the normalized content with animation
  await typeText(editor, normalizedContent, typingSpeed);
  
  // Add newline to push the original line down
  await editor.edit(editBuilder => {
    editBuilder.insert(editor.selection.active, '\n');
  });
  
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
  
  const position = line.range.start;
  const targetIndent = detectIndentation(line.text).total;
  const normalizedContent = normalizeIndentation(action.content!, targetIndent);
  
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(
    new vscode.Range(position, position),
    vscode.TextEditorRevealType.InCenter
  );
  
  await delay(300);

  // Type normalized content
  await typeText(editor, normalizedContent, typingSpeed);
  
  // Add newline
  await editor.edit(editBuilder => {
    editBuilder.insert(editor.selection.active, '\n');
  });
  
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
  
  // Fuzzy find - trim whitespace from both pattern and text
  const pattern = action.find.trim();
  const lines = text.split('\n');
  let foundIndex = -1;
  let foundLine = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const trimmedLine = lines[i].trim();
    if (trimmedLine.includes(pattern)) {
      const originalLine = lines[i];
      foundIndex = text.indexOf(originalLine);
      foundLine = i;
      break;
    }
  }
  
  if (foundIndex === -1) {
    throw new Error(`Text not found: "${action.find}"`);
  }

  // Find the actual occurrence in the original line
  const actualLine = lines[foundLine];
  const patternIndex = actualLine.indexOf(pattern);
  const absoluteIndex = foundIndex + patternIndex;
  
  // Select the text
  const startPos = document.positionAt(absoluteIndex);
  const endPos = document.positionAt(absoluteIndex + pattern.length);
  
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
  
  // Fuzzy find
  const pattern = action.find.trim();
  const lines = text.split('\n');
  let foundIndex = -1;
  let foundLine = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const trimmedLine = lines[i].trim();
    if (trimmedLine.includes(pattern)) {
      const originalLine = lines[i];
      foundIndex = text.indexOf(originalLine);
      foundLine = i;
      break;
    }
  }
  
  if (foundIndex === -1) {
    throw new Error(`Text not found: "${action.find}"`);
  }

  // Find the actual occurrence
  const actualLine = lines[foundLine];
  const patternIndex = actualLine.indexOf(pattern);
  const absoluteIndex = foundIndex + patternIndex;
  
  // Select the text
  const startPos = document.positionAt(absoluteIndex);
  const endPos = document.positionAt(absoluteIndex + pattern.length);
  
  editor.selection = new vscode.Selection(startPos, endPos);
  editor.revealRange(new vscode.Range(startPos, endPos));
  
  await delay(800);

  // Replace it - first delete, then type
  await editor.edit(editBuilder => {
    editBuilder.delete(new vscode.Range(startPos, endPos));
  });
  
  await delay(200);
  
  // Type the replacement
  await typeText(editor, action.with, typingSpeed);
}

/**
 * Find a pattern in the document with context awareness and fuzzy matching
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
  
  // Trim the pattern for fuzzy matching
  const trimmedPattern = pattern.trim();
  
  // Find all matches of the pattern (fuzzy - ignore leading/trailing whitespace)
  const matches: { line: number; character: number }[] = [];
  
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const lineText = lines[lineNum];
    const trimmedLine = lineText.trim();
    
    // Check if trimmed line contains the trimmed pattern
    if (trimmedLine.includes(trimmedPattern)) {
      // Find the actual position in the original line
      const index = lineText.indexOf(trimmedPattern);
      if (index !== -1) {
        matches.push({ line: lineNum, character: index });
      }
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
    const contextPattern = (near || inside)!.trim();
    filteredMatches = matches.filter(match => {
      // Search within +/- 20 lines for context
      const startLine = Math.max(0, match.line - 20);
      const endLine = Math.min(lines.length - 1, match.line + 20);
      
      for (let i = startLine; i <= endLine; i++) {
        if (lines[i].trim().includes(contextPattern)) {
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
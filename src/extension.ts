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

// Global decoration type for highlights
let currentHighlightDecoration: vscode.TextEditorDecorationType | null = null;

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
        const nextAction = i + 1 < blueprint.actions.length ? blueprint.actions[i + 1] : null;
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

          // SMART DETECTION: After highlight, check next action and move cursor if needed
          if (action.type === 'highlight' && nextAction) {
            await handlePostHighlight(nextAction);
          }

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

/**
 * Smart post-highlight cursor positioning
 * Checks if the next action needs cursor repositioning
 */
async function handlePostHighlight(nextAction: Action): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  // Check if next action is writeText without location, or insert without specific location
  const needsRepositioning = 
    nextAction.type === 'writeText' ||
    (nextAction.type === 'insert' && !nextAction.after && !nextAction.before && nextAction.at === undefined);

  if (needsRepositioning) {
    // Move cursor to end of document
    const document = editor.document;
    const lastLine = document.lineAt(document.lineCount - 1);
    const endPosition = lastLine.range.end;
    
    editor.selection = new vscode.Selection(endPosition, endPosition);
    
    // Add a newline if we're not already at one
    const lastLineText = lastLine.text;
    if (lastLineText.trim().length > 0) {
      await editor.edit(editBuilder => {
        editBuilder.insert(endPosition, '\n');
      });
      
      // Update cursor position after newline
      const newEndPosition = editor.document.lineAt(editor.document.lineCount - 1).range.end;
      editor.selection = new vscode.Selection(newEndPosition, newEndPosition);
    }
    
    // Scroll to cursor
    editor.revealRange(
      new vscode.Range(editor.selection.active, editor.selection.active),
      vscode.TextEditorRevealType.InCenter
    );
  }
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
 * Get language-specific indentation options from VS Code config
 */
function getLanguageIndentOptions(document: vscode.TextDocument): { insertSpaces: boolean; tabSize: number } {
  const config = vscode.workspace.getConfiguration('editor', document.uri);
  return {
    insertSpaces: config.get<boolean>('insertSpaces', true),
    tabSize: config.get<number>('tabSize', 4)
  };
}

/**
 * Detect indentation of a line (spaces or tabs), respecting language config
 */
function detectIndentation(lineText: string, options: { insertSpaces: boolean; tabSize: number }): { char: string; count: number; total: string } {
  const match = lineText.match(/^(\s+)/);
  if (!match) {
    return { char: options.insertSpaces ? ' ' : '\t', count: 0, total: '' };
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
 * Enhanced for multi-lang: Uses langId for block openers (e.g., '{' for C++/Go, ':' for Python/Ruby)
 */
function getTargetIndent(document: vscode.TextDocument, targetLine: number): string {
  if (targetLine < 0 || targetLine >= document.lineCount) {
    return '';
  }

  const line = document.lineAt(targetLine);
  const options = getLanguageIndentOptions(document);
  const indentObj = detectIndentation(line.text, options);
  const currentTotal = indentObj.total;
  const currentCount = indentObj.count;
  const indentChar = options.insertSpaces ? ' ' : '\t';
  const levelSize = options.insertSpaces ? options.tabSize : 1;

  const trimmed = line.text.trim();
  const languageId = document.languageId;
  
  // Lang-specific block openers
  let isBlockOpener = false;
  if (languageId === 'python' || languageId === 'ruby') {
    isBlockOpener = trimmed.endsWith(':');
  } else if (['javascript', 'typescript', 'go', 'cpp', 'csharp'].includes(languageId)) {
    isBlockOpener = trimmed.endsWith('{');
  }
  
  if (isBlockOpener) {
    return currentTotal + indentChar.repeat(levelSize);
  }

  // Otherwise, find the enclosing block's opener indent (sibling level)
  let scanLine = targetLine - 1;
  while (scanLine >= 0) {
    const prevLine = document.lineAt(scanLine);
    const prevIndentObj = detectIndentation(prevLine.text, options);
    if (prevIndentObj.count < currentCount) {
      return prevIndentObj.total;
    }
    scanLine--;
  }

  return '';
}

/**
 * Normalize content indentation based on target indentation and lang options
 */
function normalizeIndentation(content: string, targetIndent: string, options: { insertSpaces: boolean; tabSize: number }): string {
  const lines = content.split('\n');
  if (lines.length === 0) {
    return content;
  }

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

  const indentChar = options.insertSpaces ? ' ' : '\t';
  const levelSize = options.insertSpaces ? options.tabSize : 1;
  const normalizedLines: string[] = [];
  for (const line of lines) {
    const prefixMatch = line.match(/^\s*/);
    const prefix = prefixMatch ? prefixMatch[0] : '';
    const relativePrefix = prefix.substring(minPrefix.length);
    const contentPart = line.trimStart();
    
    let normalizedRelative = relativePrefix.replace(/\t/g, indentChar.repeat(levelSize)).replace(/ {1,3}/g, indentChar.repeat(levelSize / 4 * Math.round(relativePrefix.length / (options.tabSize / 4))));
    
    normalizedLines.push(targetIndent + normalizedRelative + contentPart);
  }

  return normalizedLines.join('\n');
}

/**
 * Auto-format the current document using VS Code's language-specific formatter
 */
async function autoFormatDocument(editor: vscode.TextEditor): Promise<void> {
  if (!editor) return;
  
  try {
    await vscode.commands.executeCommand('editor.action.formatDocument');
    await delay(200);
  } catch (error) {
    console.warn('Formatting failed for language:', editor.document.languageId, error);
  }
}

/**
 * Type text character by character using direct edits for animation
 */
async function typeText(editor: vscode.TextEditor, text: string, speed: number): Promise<void> {
  const startPosition = editor.selection.active;
  let charCount = 0;
  const scrollInterval = 20;
  const scrollPause = 50;

  for (const char of text) {
    const currentPos = editor.selection.active;
    
    await editor.edit(editBuilder => {
      editBuilder.insert(currentPos, char);
    }, {
      undoStopBefore: false,
      undoStopAfter: false
    });
    
    let newPos: vscode.Position;
    if (char === '\n') {
      newPos = new vscode.Position(currentPos.line + 1, 0);
    } else {
      newPos = currentPos.translate(0, 1);
    }
    editor.selection = new vscode.Selection(newPos, newPos);
    
    charCount++;
    
    if (char === '\n' || charCount % scrollInterval === 0) {
      editor.revealRange(editor.selection, vscode.TextEditorRevealType.Default);
      if (char !== '\n') {
        await delay(scrollPause);
      }
    }
    
    await delay(speed);
  }

  await autoFormatDocument(editor);
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

  const document = editor.document;
  const options = getLanguageIndentOptions(document);

  if (action.after) {
    await insertAfterPattern(editor, action, typingSpeed, options);
    return;
  }

  if (action.before) {
    await insertBeforePattern(editor, action, typingSpeed, options);
    return;
  }

  if (action.at !== undefined) {
    await insertAtLine(editor, action, typingSpeed, options);
    return;
  }

  throw new Error('Insert action requires "after", "before", or "at" property');
}

/**
 * Handle highlight action with decorations instead of selections
 * This prevents the highlighted text from being replaced when typing
 */
async function handleHighlight(action: Action, baseDir: string): Promise<void> {
  if (!action.path || !action.find) {
    throw new Error('highlight requires path and find');
  }

  // Clear any existing highlight decoration
  if (currentHighlightDecoration) {
    currentHighlightDecoration.dispose();
    currentHighlightDecoration = null;
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

  // Highlight the entire line containing the pattern
  const line = document.lineAt(lineResult.line);
  const startPos = line.range.start;
  const endPos = line.range.end;

  // Create decoration for visual highlight (doesn't interfere with typing)
  currentHighlightDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(255, 255, 0, 0.25)', // Subtle yellow highlight
    border: '2px solid rgba(255, 255, 0, 0.6)',
    borderRadius: '3px',
    isWholeLine: false
  });

  // Apply the decoration
  editor.setDecorations(currentHighlightDecoration, [new vscode.Range(startPos, endPos)]);

  // Reveal the range without selecting it
  editor.revealRange(
    new vscode.Range(startPos, endPos),
    vscode.TextEditorRevealType.InCenter
  );

  // Move cursor to end of highlighted line (but don't select)
  editor.selection = new vscode.Selection(endPos, endPos);

  // Keep the highlight visible for a moment
  await delay(800);

  // Clear the decoration after the delay
  if (currentHighlightDecoration) {
    currentHighlightDecoration.dispose();
    currentHighlightDecoration = null;
  }
}

/**
 * Insert after a pattern
 */
async function insertAfterPattern(
  editor: vscode.TextEditor,
  action: Action,
  typingSpeed: number,
  options: { insertSpaces: boolean; tabSize: number }
): Promise<void> {
  const document = editor.document;
  
  const lineResult = findPattern(document, action.after!, action.near, action.inside, action.occurrence);
  
  if (!lineResult) {
    throw new Error(`Pattern not found: "${action.after}"${action.near ? ` near "${action.near}"` : ''}`);
  }

  const line = document.lineAt(lineResult.line);
  const endPosition = line.range.end;
  
  editor.selection = new vscode.Selection(endPosition, endPosition);
  editor.revealRange(
    new vscode.Range(endPosition, endPosition),
    vscode.TextEditorRevealType.InCenter
  );
  
  await delay(300);

  const targetIndent = getTargetIndent(document, lineResult.line);
  const normalizedContent = normalizeIndentation(action.content!, targetIndent, options);
  
  await editor.edit(editBuilder => {
    editBuilder.insert(endPosition, '\n');
  });
  
  await delay(100);
  
  const newLineNum = endPosition.line + 1;
  const newLine = editor.document.lineAt(newLineNum);
  const newLinePosition = newLine.range.start;
  editor.selection = new vscode.Selection(newLinePosition, newLinePosition);
  
  await typeText(editor, normalizedContent, typingSpeed);
}

/**
 * Insert before a pattern
 */
async function insertBeforePattern(
  editor: vscode.TextEditor,
  action: Action,
  typingSpeed: number,
  options: { insertSpaces: boolean; tabSize: number }
): Promise<void> {
  const document = editor.document;
  
  const lineResult = findPattern(document, action.before!, action.near, action.inside, action.occurrence);
  
  if (!lineResult) {
    throw new Error(`Pattern not found: "${action.before}"${action.near ? ` near "${action.near}"` : ''}`);
  }

  const line = document.lineAt(lineResult.line);
  const startPosition = line.range.start;
  
  const targetIndent = detectIndentation(line.text, options).total;
  const normalizedContent = normalizeIndentation(action.content!, targetIndent, options);
  
  editor.selection = new vscode.Selection(startPosition, startPosition);
  editor.revealRange(
    new vscode.Range(startPosition, startPosition),
    vscode.TextEditorRevealType.InCenter
  );
  
  await delay(300);

  await typeText(editor, normalizedContent, typingSpeed);
  
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
  typingSpeed: number,
  options: { insertSpaces: boolean; tabSize: number }
): Promise<void> {
  const document = editor.document;
  const lineNumber = Math.max(0, Math.min(action.at!, document.lineCount - 1));
  const line = document.lineAt(lineNumber);
  
  const position = line.range.start;
  const targetIndent = detectIndentation(line.text, options).total;
  const normalizedContent = normalizeIndentation(action.content!, targetIndent, options);
  
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(
    new vscode.Range(position, position),
    vscode.TextEditorRevealType.InCenter
  );
  
  await delay(300);

  await typeText(editor, normalizedContent, typingSpeed);
  
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

  const actualLine = lines[foundLine];
  const patternIndex = actualLine.indexOf(pattern);
  const absoluteIndex = foundIndex + patternIndex;
  
  const startPos = document.positionAt(absoluteIndex);
  const endPos = document.positionAt(absoluteIndex + pattern.length);
  
  editor.selection = new vscode.Selection(startPos, endPos);
  editor.revealRange(new vscode.Range(startPos, endPos));
  
  await delay(500);

  await editor.edit(editBuilder => {
    editBuilder.delete(new vscode.Range(startPos, endPos));
  });

  await autoFormatDocument(editor);
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

  const actualLine = lines[foundLine];
  const patternIndex = actualLine.indexOf(pattern);
  const absoluteIndex = foundIndex + patternIndex;
  
  const startPos = document.positionAt(absoluteIndex);
  const endPos = document.positionAt(absoluteIndex + pattern.length);
  
  editor.selection = new vscode.Selection(startPos, endPos);
  editor.revealRange(new vscode.Range(startPos, endPos));
  
  await delay(800);

  await editor.edit(editBuilder => {
    editBuilder.delete(new vscode.Range(startPos, endPos));
  });
  
  await delay(200);
  
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
  
  const trimmedPattern = pattern.trim();
  
  const matches: { line: number; character: number }[] = [];
  
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const lineText = lines[lineNum];
    const trimmedLine = lineText.trim();
    
    if (trimmedLine.includes(trimmedPattern)) {
      const index = lineText.indexOf(trimmedPattern);
      if (index !== -1) {
        matches.push({ line: lineNum, character: index });
      }
    }
  }

  if (matches.length === 0) {
    return null;
  }

  if (matches.length === 1) {
    return matches[0];
  }

  let filteredMatches = matches;

  if (near || inside) {
    const contextPattern = (near || inside)!.trim();
    filteredMatches = matches.filter(match => {
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

  const index = Math.min((occurrence || 1) - 1, filteredMatches.length - 1);
  return filteredMatches[index];
}

export function deactivate() {
  if (audioHandler) {
    audioHandler.cleanup();
  }
  
  // Clean up any remaining highlight decorations
  if (currentHighlightDecoration) {
    currentHighlightDecoration.dispose();
    currentHighlightDecoration = null;
  }
}
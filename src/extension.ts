// extension.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AudioHandler } from './audioHandler';
import { TimestampTracker } from './timestampTracker';
import { TerminalHandler } from './terminalHandler';
import { StatusReporter } from './statusReporter';
import { HttpServer } from './httpServer';

interface Action {
  type?: 'createFolder' | 'createFile' | 'openFile' | 'writeText' | 'insert' | 'delete' | 'replace' | 'highlight' | 'openTerminal' | 'runCommand' | 'showTerminal' | 'hideTerminal' | 'closeTerminal';
  action?: 'createFolder' | 'createFile' | 'openFile' | 'writeText' | 'insert' | 'delete' | 'replace' | 'highlight' | 'openTerminal' | 'runCommand' | 'showTerminal' | 'hideTerminal' | 'closeTerminal';
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

  // Highlight cursor control
  moveCursor?: 'newLineAfter' | 'newLineBefore' | 'sameLine' | 'endOfFile' | 'stay' | 'nextBlankLine';

  // Auto-highlight executed change
  highlight?: boolean;

  // Terminal options
  terminalName?: string;
  command?: string;
  cwd?: string;
  timeout?: number;
  waitForCompletion?: boolean;
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
let timestampTracker: TimestampTracker;
let terminalHandler: TerminalHandler;
let statusReporter: StatusReporter;
let httpServer: HttpServer;

// Global decoration type for highlights
let currentHighlightDecoration: vscode.TextEditorDecorationType | null = null;

// Global status bar item
let globalStatusBar: vscode.StatusBarItem;

// Timer interval
let timerInterval: NodeJS.Timeout | null = null;

/**
 * Normalize action to ensure it has a 'type' property
 * Supports both 'type' and 'action' for compatibility
 */
function normalizeAction(action: Action): Action {
  const normalized = { ...action };

  // If 'action' is provided but not 'type', copy it over
  if (action.action && !action.type) {
    normalized.type = action.action;
  }

  // If neither is provided, throw error
  if (!normalized.type) {
    throw new Error('Action must have either "type" or "action" property');
  }

  return normalized;
}

/**
 * Extract all voiceover requests from blueprint actions
 */
function extractVoiceovers(actions: Action[], defaultVoice: string): Array<{ text: string; voice: string }> {
  const voiceovers: Array<{ text: string; voice: string }> = [];

  for (const action of actions) {
    if (action.voiceover) {
      voiceovers.push({
        text: action.voiceover,
        voice: action.voice || defaultVoice
      });
    }
  }

  return voiceovers;
}

/**
 * Update status bar with background audio generation progress
 */
async function monitorAudioGeneration(statusBar: vscode.StatusBarItem): Promise<void> {
  const cacheManager = audioHandler.getCacheManager();

  while (!cacheManager.isAllReady()) {
    const status = cacheManager.getProgress();
    const timerPrefix = timestampTracker.getElapsedFormatted();
    statusBar.text = `${timerPrefix} $(sync~spin) Generating audio (${status.ready}/${status.total})...`;
    await delay(500);
  }

  const finalStatus = cacheManager.getProgress();
  if (finalStatus.failed > 0) {
    const timerPrefix = timestampTracker.getElapsedFormatted();
    statusBar.text = `${timerPrefix} $(warning) Audio: ${finalStatus.ready} ready, ${finalStatus.failed} failed`;
    await delay(2000);
  }
}

/**
 * Start timer that updates status bar every second
 */
function startTimer(statusBar: vscode.StatusBarItem, getCurrentMessage: () => string): void {
  // Clear any existing timer
  if (timerInterval) {
    clearInterval(timerInterval);
  }

  // Update every second
  timerInterval = setInterval(() => {
    const timerPrefix = timestampTracker.getElapsedFormatted();
    const currentMsg = getCurrentMessage();
    statusBar.text = `${timerPrefix} ${currentMsg}`;
  }, 1000);
}

/**
 * Stop the timer
 */
function stopTimer(): void {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

export function activate(context: vscode.ExtensionContext) {
  console.log('JSON Project Builder is now active!');

  audioHandler = new AudioHandler();
  timestampTracker = new TimestampTracker();
  terminalHandler = new TerminalHandler();
  statusReporter = new StatusReporter(); // Reports to http://localhost:5555

  // Start HTTP server for automation
  console.log('[DEBUG] Reading HTTP server configuration...');
  const config = vscode.workspace.getConfiguration('json-project-builder');
  const serverEnabled = config.get<boolean>('server.enabled', true);
  const serverPort = config.get<number>('server.port', 6969);

  console.log(`[DEBUG] Server config: enabled=${serverEnabled}, port=${serverPort}`);

  console.log('[DEBUG] Creating HttpServer instance...');
  httpServer = new HttpServer(serverPort, serverEnabled);

  console.log('[DEBUG] Starting HTTP server...');
  httpServer.start().catch(err => {
    console.error('Failed to start HTTP server:', err);
  });

  // Create global status bar item
  globalStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  context.subscriptions.push(globalStatusBar);

  // Register cleanup on extension deactivation or disposal
  context.subscriptions.push({
    dispose: () => {
      console.log('Cleaning up resources...');
      stopTimer();
      if (audioHandler) {
        audioHandler.cleanup();
      }
      if (terminalHandler) {
        terminalHandler.dispose();
      }
      if (httpServer) {
        httpServer.stop().catch(err => {
          console.error('Error stopping HTTP server:', err);
        });
      }
      if (globalStatusBar) {
        globalStatusBar.dispose();
      }
    }
  });

  // Command accepts optional path argument for automation
  // Usage: vscode.commands.executeCommand('json-project-builder.buildFromJson', '/path/to/file.json')
  let disposable = vscode.commands.registerCommand('json-project-builder.buildFromJson', async (pathArg?: string) => {
    let selectedPath: string;

    if (pathArg && typeof pathArg === 'string') {
      // Path provided programmatically (for automation)
      selectedPath = pathArg;
      console.log(`[StatusReporter] Using provided path: ${selectedPath}`);
    } else {
      // Show file picker dialog
      const fileUri = await vscode.window.showOpenDialog({
        canSelectMany: false,
        canSelectFiles: true,
        canSelectFolders: true,
        filters: { 'JSON Files': ['json'] },
        openLabel: 'Select Blueprint JSON or Folder'
      });

      if (!fileUri || fileUri.length === 0) {
        globalStatusBar.text = '$(error) No file or folder selected';
        globalStatusBar.show();
        await delay(3000);
        globalStatusBar.hide();
        return;
      }

      selectedPath = fileUri[0].fsPath;
    }

    // Validate path exists
    if (!fs.existsSync(selectedPath)) {
      const errorMsg = `Path does not exist: ${selectedPath}`;
      globalStatusBar.text = `$(error) ${errorMsg}`;
      globalStatusBar.show();
      statusReporter.reportError(errorMsg);
      await delay(3000);
      globalStatusBar.hide();
      return;
    }
    const stats = fs.statSync(selectedPath);

    let blueprintFiles: string[] = [];

    if (stats.isDirectory()) {
      // User selected a folder - find all JSON files
      const files = fs.readdirSync(selectedPath);
      blueprintFiles = files
        .filter(file => file.endsWith('.json'))
        .map(file => path.join(selectedPath, file))
        .sort(); // Process in alphabetical order

      if (blueprintFiles.length === 0) {
        globalStatusBar.text = '$(error) No JSON files found in folder';
        globalStatusBar.show();
        await delay(3000);
        globalStatusBar.hide();
        return;
      }

      globalStatusBar.text = `$(folder) Found ${blueprintFiles.length} blueprint(s)`;
      globalStatusBar.show();
      await delay(2000);
    } else {
      // User selected a single file
      blueprintFiles = [selectedPath];
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      globalStatusBar.text = '$(error) No workspace folder open';
      globalStatusBar.show();
      await delay(3000);
      globalStatusBar.hide();
      return;
    }

    globalStatusBar.show();

    // We need baseDir early to start timestamp tracking
    // Parse first blueprint to get rootFolder
    let firstBlueprintPath: string = '';
    try {
      const firstJsonContent = fs.readFileSync(blueprintFiles[0], 'utf-8');
      const firstBlueprint = JSON.parse(firstJsonContent);
      if (!firstBlueprint.rootFolder) {
        globalStatusBar.text = '$(error) First blueprint missing rootFolder';
        globalStatusBar.show();
        await delay(3000);
        globalStatusBar.hide();
        return;
      }
      firstBlueprintPath = path.join(workspaceFolder.uri.fsPath, firstBlueprint.rootFolder);
    } catch (error) {
      globalStatusBar.text = '$(error) Failed to parse first blueprint';
      globalStatusBar.show();
      await delay(3000);
      globalStatusBar.hide();
      return;
    }

    // START TIMESTAMP TRACKING (always, for any number of blueprints)
    timestampTracker.start(firstBlueprintPath);
    globalStatusBar.text = `[00:00:00] $(watch) Timestamp tracking started`;
    await delay(1500);

    // Start timer to update status bar every second
    let currentStatusMessage = '$(rocket) Processing...';
    startTimer(globalStatusBar, () => currentStatusMessage);

    // Wrap the entire execution in try-finally to ensure cleanup
    try {
      // Track results for summary at the end
      const results: { file: string; success: boolean; error?: string }[] = [];

      // Process each blueprint file
      for (let fileIndex = 0; fileIndex < blueprintFiles.length; fileIndex++) {
        const jsonPath = blueprintFiles[fileIndex];
        const fileName = path.basename(jsonPath);

        currentStatusMessage = `$(file-code) Loading ${fileName}...`;

        // RECORD START OF THIS BLUEPRINT (always)
        if (blueprintFiles.length > 1) {
          timestampTracker.recordBlueprintStart(fileName);
        }

        let blueprint: Blueprint;

        try {
          const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
          blueprint = JSON.parse(jsonContent);
        } catch (error) {
          currentStatusMessage = `$(error) Failed to parse ${fileName}`;
          await delay(3000);
          results.push({ file: fileName, success: false, error: `Parse error: ${error}` });

          // RECORD END EVEN ON ERROR (always)
          if (blueprintFiles.length > 1) {
            timestampTracker.recordBlueprintEnd();
          }

          continue; // Skip this file and continue with next
        }

        // Validate blueprint structure
        if (!blueprint.rootFolder) {
          currentStatusMessage = `$(error) ${fileName}: Missing rootFolder`;
          await delay(3000);
          results.push({ file: fileName, success: false, error: 'Missing rootFolder property' });

          // RECORD END EVEN ON ERROR (always)
          if (blueprintFiles.length > 1) {
            timestampTracker.recordBlueprintEnd();
          }

          continue;
        }

        if (!blueprint.actions || !Array.isArray(blueprint.actions)) {
          currentStatusMessage = `$(error) ${fileName}: Invalid actions array`;
          await delay(3000);
          results.push({ file: fileName, success: false, error: 'Missing or invalid actions array' });

          // RECORD END EVEN ON ERROR (always)
          if (blueprintFiles.length > 1) {
            timestampTracker.recordBlueprintEnd();
          }

          continue;
        }

        // Normalize all actions
        try {
          blueprint.actions = blueprint.actions.map((action, idx) => {
            try {
              return normalizeAction(action);
            } catch (err) {
              throw new Error(`Action ${idx + 1}: ${err}`);
            }
          });
        } catch (error) {
          currentStatusMessage = `$(error) ${fileName}: ${error}`;
          await delay(3000);
          results.push({ file: fileName, success: false, error: `${error}` });

          // RECORD END EVEN ON ERROR (always)
          if (blueprintFiles.length > 1) {
            timestampTracker.recordBlueprintEnd();
          }

          continue;
        }

        const baseDir = path.join(workspaceFolder.uri.fsPath, blueprint.rootFolder);

        if (!fs.existsSync(baseDir)) {
          fs.mkdirSync(baseDir, { recursive: true });
        }

        const globalTypingSpeed = blueprint.globalTypingSpeed || 150; // 150ms per character for human-like typing
        const actionDelay = blueprint.actionDelay || 800;
        const defaultVoice = blueprint.defaultVoice || 'en-US-AriaNeural';
        const enableVoiceover = blueprint.enableVoiceover !== false;

        // START PARALLEL AUDIO GENERATION IN BACKGROUND (NON-BLOCKING)
        let audioGenerationMonitor: Promise<void> | null = null;

        if (enableVoiceover) {
          const voiceovers = extractVoiceovers(blueprint.actions, defaultVoice);

          if (voiceovers.length > 0) {
            currentStatusMessage = `$(sync~spin) Starting audio generation (${voiceovers.length} files)...`;

            const cacheManager = audioHandler.getCacheManager();

            // Start generation in background (non-blocking)
            cacheManager.pregenerateAll(voiceovers).catch(err => {
              console.error('Background audio generation error:', err);
            });

            // Start monitoring in background
            audioGenerationMonitor = monitorAudioGeneration(globalStatusBar);

            // Small delay to show the status
            await delay(1000);
          }
        }

        const blueprintTitle = blueprintFiles.length > 1
          ? `[${fileIndex + 1}/${blueprintFiles.length}] ${fileName}`
          : fileName;

        const totalActions = blueprint.actions.length;

        // Report blueprint start to Python server
        statusReporter.reportStart(fileName, totalActions);

        // Update HTTP server progress state
        if (httpServer) {
          httpServer.updateProgress({
            busy: true,
            status: 'processing',
            blueprint: fileName,
            currentStep: 0,
            totalSteps: totalActions,
            currentAction: 'Starting...',
            error: null
          });
        }

        // Flag to track if this blueprint completed successfully
        let blueprintSuccess = true;
        let blueprintError = '';

        try {
          for (let i = 0; i < blueprint.actions.length; i++) {
            const action = blueprint.actions[i];
            const nextAction = i + 1 < blueprint.actions.length ? blueprint.actions[i + 1] : null;
            const actionName = getActionDescription(action);

            // Update current status message for timer
            currentStatusMessage = `$(rocket) [${i + 1}/${totalActions}] ${actionName}`;

            // Update HTTP server progress
            if (httpServer) {
              httpServer.updateProgress({
                currentStep: i + 1,
                currentAction: actionName
              });
            }

            // Report action start to Python server
            statusReporter.reportActionStart(i + 1, totalActions, actionName);

            // DETAILED CONSOLE LOGGING
            console.log(`\n${'='.repeat(60)}`);
            console.log(`📍 ACTION ${i + 1}/${totalActions}: ${action.type?.toUpperCase()}`);
            console.log(`${'='.repeat(60)}`);
            console.log(`📄 File: ${fileName}`);
            console.log(`🎯 Action Details:`, JSON.stringify(action, null, 2));
            console.log(`⏱️  Status: ${currentStatusMessage}`);
            console.log(`${'='.repeat(60)}\n`);

            try {
              // Special handling for highlight actions with voiceover
              if (action.type === 'highlight') {
                console.log(`🔦 Executing HIGHLIGHT action...`);
                console.log(`   - Target file: ${action.path}`);
                console.log(`   - Pattern to find: "${action.find}"`);
                if (action.near) console.log(`   - Context (near): "${action.near}"`);
                if (action.voiceover) console.log(`   - Has voiceover: Yes`);

                await handleHighlightWithVoiceover(action, baseDir, enableVoiceover, defaultVoice, currentStatusMessage, (msg) => { currentStatusMessage = msg; });

                // Handle cursor positioning after highlight
                await handlePostHighlight(action, nextAction);
                console.log(`✅ HIGHLIGHT completed successfully\n`);
              } else {
                // Normal action handling
                const voiceoverTiming = action.voiceover ? (action.voiceoverTiming || 'before') : null;
                const voiceToUse = action.voice || defaultVoice;

                if (enableVoiceover && voiceoverTiming === 'before') {
                  console.log(`🎤 Playing voiceover BEFORE action...`);
                  currentStatusMessage = `$(unmute) Playing voiceover...`;
                  await audioHandler.playVoiceover(action.voiceover!, voiceToUse, 'before');
                  // Restore action status after audio
                  currentStatusMessage = `$(rocket) [${i + 1}/${totalActions}] ${actionName}`;
                }

                let duringAudioPromise: Promise<void> | null = null;
                if (enableVoiceover && voiceoverTiming === 'during') {
                  console.log(`🎤 Starting voiceover DURING action...`);
                  currentStatusMessage = `$(unmute) ${actionName} + audio`;
                  duringAudioPromise = audioHandler.playVoiceover(action.voiceover!, voiceToUse, 'during');
                  await delay(100);
                }

                console.log(`⚙️  Executing ${action.type} action...`);

                // Capture state before action for highlight logic
                const editorBefore = vscode.window.activeTextEditor;
                const lineCountBefore = editorBefore ? editorBefore.document.lineCount : 0;
                const cursorLineBefore = editorBefore ? editorBefore.selection.active.line : 0;

                // EXECUTE ACTION
                await executeAction(action, baseDir, globalTypingSpeed, currentStatusMessage, (msg) => { currentStatusMessage = msg; });

                // HANDLE AUTO-HIGHLIGHT (if requested)
                if (action.highlight && editorBefore) {
                  const editorAfter = vscode.window.activeTextEditor;
                  if (editorAfter) {
                    const lineCountAfter = editorAfter.document.lineCount;
                    const cursorLineAfter = editorAfter.selection.active.line;

                    // Calculate how many NEW lines were added
                    const newLinesAdded = lineCountAfter - lineCountBefore;

                    // The new content spans from (cursorLineAfter - newLinesAdded + 1) to cursorLineAfter
                    // But we also typed on the line we landed on, so:
                    let highlightStartLine: number;
                    let highlightEndLine = cursorLineAfter;

                    if (newLinesAdded > 0) {
                      // Multi-line insert: start is where content began
                      highlightStartLine = Math.max(0, cursorLineAfter - newLinesAdded);
                    } else {
                      // Single line edit: just highlight current line
                      highlightStartLine = cursorLineAfter;
                    }

                    const startPos = new vscode.Position(highlightStartLine, 0);
                    const endPos = editorAfter.document.lineAt(highlightEndLine).range.end;
                    const highlightRange = new vscode.Range(startPos, endPos);

                    // Apply transient highlight (softer color, shorter duration)
                    currentHighlightDecoration = vscode.window.createTextEditorDecorationType({
                      backgroundColor: 'rgba(100, 200, 100, 0.2)',
                      border: '1px solid rgba(100, 200, 100, 0.5)',
                      borderRadius: '3px',
                      isWholeLine: true
                    });

                    editorAfter.setDecorations(currentHighlightDecoration, [highlightRange]);

                    // Brief highlight - just enough to see what was added
                    await delay(800);

                    // Clean up immediately unless voiceover is pending
                    if (!action.voiceover || voiceoverTiming !== 'after') {
                      if (currentHighlightDecoration) {
                        currentHighlightDecoration.dispose();
                        currentHighlightDecoration = null;
                      }
                    }
                  }
                }

                console.log(`✅ ${action.type} completed successfully`);
                statusReporter.reportActionComplete(i + 1, totalActions);

                if (enableVoiceover && voiceoverTiming === 'after') {
                  console.log(`🎤 Playing voiceover AFTER action...`);
                  currentStatusMessage = `$(unmute) Playing voiceover...`;
                  await audioHandler.playVoiceover(action.voiceover!, voiceToUse, 'after');
                }

                if (duringAudioPromise) {
                  await duringAudioPromise;
                  console.log(`🎤 Voiceover completed`);
                }

                // Cleanup auto-highlight
                if (action.highlight && currentHighlightDecoration) {
                  currentHighlightDecoration.dispose();
                  currentHighlightDecoration = null;
                }
              }

              await delay(actionDelay);
            } catch (error) {
              // ENHANCED ERROR HANDLING
              const errorMessage = error instanceof Error ? error.message : String(error);
              const errorStack = error instanceof Error ? error.stack : 'No stack trace available';

              // Log the error for this blueprint but don't stop processing
              blueprintSuccess = false;
              blueprintError = `Error at step ${i + 1} (${action.type}): ${errorMessage}`;

              // Update HTTP server progress with error
              if (httpServer) {
                httpServer.updateProgress({
                  status: 'error',
                  error: errorMessage
                });
              }

              // Report error to Python server
              statusReporter.reportActionError(i + 1, totalActions, actionName, errorMessage);

              // DETAILED CONSOLE ERROR LOGGING
              console.error(`\n${'❌'.repeat(30)}`);
              console.error(`💥 CRASH DETECTED AT ACTION ${i + 1}/${totalActions}`);
              console.error(`${'❌'.repeat(30)}`);
              console.error(`📄 Blueprint: ${fileName}`);
              console.error(`🎯 Action Type: ${action.type}`);
              console.error(`📊 Action Number: ${i + 1} of ${totalActions}`);
              console.error(`\n🔍 ACTION DETAILS:`);
              console.error(JSON.stringify(action, null, 2));
              console.error(`\n❗ ERROR MESSAGE:`);
              console.error(errorMessage);
              console.error(`\n📚 FULL STACK TRACE:`);
              console.error(errorStack);
              console.error(`\n💡 LIKELY CAUSE:`);

              // Provide helpful error context based on action type
              if (action.type === 'insert' || action.type === 'highlight' || action.type === 'delete' || action.type === 'replace') {
                const pattern = action.find || action.after || action.before;
                console.error(`   Pattern matching failed. Could not find: "${pattern}"`);
                if (action.near) {
                  console.error(`   Context filter: "${action.near}"`);
                }
                console.error(`   Possible reasons:`);
                console.error(`   - Pattern doesn't exist in the file yet`);
                console.error(`   - Typo in the pattern string`);
                console.error(`   - File content doesn't match expectation`);
                console.error(`   - Previous action didn't execute correctly`);
              } else if (action.type === 'openFile') {
                console.error(`   File not found or couldn't be opened: ${action.path}`);
                console.error(`   Check if the file was created in a previous step`);
              } else if (action.type === 'writeText') {
                console.error(`   No active editor or invalid content`);
                console.error(`   Make sure openFile was called first`);
              }
              console.error(`${'❌'.repeat(30)}\n`);

              // SHOW VS CODE TOAST NOTIFICATION
              const actionDescription = getActionDescription(action);
              const notificationMessage = `Blueprint crashed at action ${i + 1}/${totalActions}: ${action.type}\n\nError: ${errorMessage}\n\nCheck Debug Console for full details.`;

              vscode.window.showErrorMessage(
                `❌ Tutorial Failed: ${actionDescription}`,
                { modal: false, detail: notificationMessage },
                'View Details',
                'Continue'
              ).then(selection => {
                if (selection === 'View Details') {
                  vscode.commands.executeCommand('workbench.action.toggleDevTools');
                }
              });

              currentStatusMessage = `$(error) ${fileName} failed at step ${i + 1}`;
              await delay(3000);
              break; // Break out of action loop, but continue to next blueprint
            }
          }
        } finally {
          // Wait for audio generation monitor to complete
          if (audioGenerationMonitor) {
            await audioGenerationMonitor;
          }

          // Cleanup remaining audio files for this blueprint
          audioHandler.getCacheManager().reset();
        }

        // Record result for this blueprint
        if (blueprintSuccess) {
          results.push({ file: fileName, success: true });
          currentStatusMessage = `$(check) ${fileName} completed`;
          statusReporter.reportBlueprintDone(fileName, true);

          // Update HTTP server progress - done
          if (httpServer) {
            httpServer.updateProgress({
              busy: false,
              status: 'done',
              currentStep: totalActions
            });
          }

          await delay(2000);
        } else {
          results.push({ file: fileName, success: false, error: blueprintError });
          statusReporter.reportBlueprintDone(fileName, false);

          // HTTP server already updated with error in catch block
        }

        // RECORD END OF THIS BLUEPRINT (always)
        if (blueprintFiles.length > 1) {
          timestampTracker.recordBlueprintEnd();
        }

        // Show transition message between blueprints
        if (fileIndex < blueprintFiles.length - 1) {
          if (blueprintSuccess) {
            currentStatusMessage = `$(arrow-right) Moving to next blueprint...`;
          } else {
            currentStatusMessage = `$(arrow-right) Skipping to next blueprint...`;
          }
          await delay(1500);
        }
      }

      // Stop the timer
      stopTimer();

      // Show final summary
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;

      // Report all done to Python server
      statusReporter.reportAllDone(successCount, failCount);

      const finalTimer = timestampTracker.getElapsedFormatted();

      if (failCount === 0) {
        globalStatusBar.text = `${finalTimer} $(check) All ${blueprintFiles.length} blueprint(s) completed!`;
      } else if (successCount === 0) {
        globalStatusBar.text = `${finalTimer} $(error) All ${blueprintFiles.length} blueprint(s) failed`;
      } else {
        globalStatusBar.text = `${finalTimer} $(warning) ${successCount}/${blueprintFiles.length} blueprints completed`;
      }

      await delay(3000);

      // SAVE TIMESTAMPS FILE (always)
      timestampTracker.saveTimestamps();
      globalStatusBar.text = `${finalTimer} $(check) Timestamps saved to timestamps.txt`;
      await delay(3000);

      // Reset HTTP server progress to idle
      if (httpServer) {
        httpServer.resetProgress();
      }

      globalStatusBar.hide();
    } catch (error) {
      // Handle any unexpected errors
      stopTimer();
      const finalTimer = timestampTracker.getElapsedFormatted();
      const errorMessage = error instanceof Error ? error.message : String(error);
      globalStatusBar.text = `${finalTimer} $(error) Extension error: ${errorMessage}`;
      console.error('Extension error:', error);

      // Report fatal error to Python server
      statusReporter.reportError(`Fatal extension error: ${errorMessage}`);
      statusReporter.reportAllDone(0, 1); // Signal failure

      // Update HTTP server progress with fatal error
      if (httpServer) {
        httpServer.updateProgress({
          busy: false,
          status: 'error',
          error: `Fatal error: ${errorMessage}`
        });
      }

      await delay(5000);
      globalStatusBar.hide();
    } finally {
      // ALWAYS cleanup any remaining audio files
      stopTimer();
      console.log('Final cleanup of audio files...');
      audioHandler.getCacheManager().cleanup();
    }
  });

  context.subscriptions.push(disposable);

  // Register alias command for automation (requires path argument)
  let pathDisposable = vscode.commands.registerCommand('json-project-builder.buildFromPath', async (pathArg: string) => {
    if (!pathArg || typeof pathArg !== 'string') {
      vscode.window.showErrorMessage('buildFromPath requires a path argument');
      statusReporter.reportError('buildFromPath called without path argument');
      return;
    }
    // Delegate to main command with the path
    await vscode.commands.executeCommand('json-project-builder.buildFromJson', pathArg);
  });

  context.subscriptions.push(pathDisposable);

  // Register test command with input box for easy development testing
  let testDisposable = vscode.commands.registerCommand('json-project-builder.testWithPath', async () => {
    const pathInput = await vscode.window.showInputBox({
      prompt: 'Enter the full path to your JSON blueprint file',
      placeHolder: '/Volumes/hard-drive/auto-write-vs-code/json-project-builder/rust-demo.json',
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return 'Path cannot be empty';
        }
        if (!value.endsWith('.json')) {
          return 'Path must point to a .json file';
        }
        return null;
      }
    });

    if (!pathInput) {
      vscode.window.showInformationMessage('No path provided');
      return;
    }

    // Execute with the provided path
    await vscode.commands.executeCommand('json-project-builder.buildFromJson', pathInput.trim());
  });

  context.subscriptions.push(testDisposable);
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
      if (action.after) return `Inserting after: ${action.after.substring(0, 20)}...`;
      if (action.before) return `Inserting before: ${action.before.substring(0, 20)}...`;
      if (action.at !== undefined) return `Inserting at line ${action.at}`;
      return `Inserting code...`;
    case 'delete':
      return `Deleting: ${action.find?.substring(0, 20)}...`;
    case 'replace':
      return `Replacing: ${action.find?.substring(0, 20)}...`;
    case 'highlight':
      return `Highlighting: ${action.find?.substring(0, 20)}...`;
    case 'openTerminal':
      return `Opening terminal: ${action.terminalName || 'Build'}`;
    case 'runCommand':
      return `Running: ${action.command?.substring(0, 30)}...`;
    case 'showTerminal':
      return `Showing terminal`;
    case 'hideTerminal':
      return `Hiding terminal`;
    case 'closeTerminal':
      return `Closing terminal`;
    default:
      return action.type || 'Unknown action';
  }
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Handle highlight action with synchronized voiceover
 * Keeps highlight visible until voiceover completes
 */
async function handleHighlightWithVoiceover(
  action: Action,
  baseDir: string,
  enableVoiceover: boolean,
  defaultVoice: string,
  currentMessage: string,
  updateMessage: (msg: string) => void
): Promise<void> {
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

  // Create decoration for visual highlight
  currentHighlightDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(255, 255, 0, 0.25)',
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

  // Handle voiceover timing for highlights
  const voiceoverTiming = action.voiceover ? (action.voiceoverTiming || 'before') : null;
  const voiceToUse = action.voice || defaultVoice;
  const minHighlightDuration = 1000; // Minimum 1 second highlight

  if (enableVoiceover && action.voiceover) {
    updateMessage(`$(unmute) Playing voiceover...`);

    if (voiceoverTiming === 'before') {
      await audioHandler.playVoiceover(action.voiceover, voiceToUse, 'before');
      // Keep highlight for minimum duration after voiceover
      await delay(minHighlightDuration);
    } else if (voiceoverTiming === 'during' || voiceoverTiming === 'after') {
      // Play voiceover and keep highlight until it finishes
      await audioHandler.playVoiceover(action.voiceover, voiceToUse, voiceoverTiming);
    }
  } else {
    // No voiceover, use minimum highlight duration
    await delay(minHighlightDuration);
  }

  // Clear the decoration after voiceover completes
  if (currentHighlightDecoration) {
    currentHighlightDecoration.dispose();
    currentHighlightDecoration = null;
  }
}

/**
 * Smart post-highlight cursor positioning based on action settings and next action
 */
async function handlePostHighlight(currentAction: Action, nextAction: Action | null): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const document = editor.document;

  // If user explicitly specified cursor movement, use that
  if (currentAction.moveCursor) {
    await applyCursorMovement(editor, currentAction.moveCursor);
    return;
  }

  // Otherwise, use smart detection based on next action
  if (!nextAction) return;

  const needsRepositioning =
    nextAction.type === 'writeText' ||
    (nextAction.type === 'insert' && !nextAction.after && !nextAction.before && nextAction.at === undefined);

  if (needsRepositioning) {
    // Default smart behavior: move to end of file
    await applyCursorMovement(editor, 'endOfFile');
  }
}

/**
 * Apply cursor movement strategy after highlight
 */
async function applyCursorMovement(editor: vscode.TextEditor, movement: string): Promise<void> {
  const document = editor.document;
  const currentLine = editor.selection.active.line;

  switch (movement) {
    case 'newLineAfter': {
      const line = document.lineAt(currentLine);
      const endPosition = line.range.end;

      await editor.edit(editBuilder => {
        editBuilder.insert(endPosition, '\n');
      });

      const newPosition = new vscode.Position(currentLine + 1, 0);
      editor.selection = new vscode.Selection(newPosition, newPosition);
      editor.revealRange(
        new vscode.Range(newPosition, newPosition),
        vscode.TextEditorRevealType.InCenter
      );
      break;
    }

    case 'newLineBefore': {
      const line = document.lineAt(currentLine);
      const startPosition = line.range.start;

      await editor.edit(editBuilder => {
        editBuilder.insert(startPosition, '\n');
      });

      const newPosition = new vscode.Position(currentLine, 0);
      editor.selection = new vscode.Selection(newPosition, newPosition);
      editor.revealRange(
        new vscode.Range(newPosition, newPosition),
        vscode.TextEditorRevealType.InCenter
      );
      break;
    }

    case 'sameLine': {
      const line = document.lineAt(currentLine);
      const endPosition = line.range.end;
      editor.selection = new vscode.Selection(endPosition, endPosition);
      break;
    }

    case 'endOfFile': {
      const lastLine = document.lineAt(document.lineCount - 1);
      const endPosition = lastLine.range.end;

      editor.selection = new vscode.Selection(endPosition, endPosition);

      const lastLineText = lastLine.text;
      if (lastLineText.trim().length > 0) {
        await editor.edit(editBuilder => {
          editBuilder.insert(endPosition, '\n');
        });

        const newEndPosition = editor.document.lineAt(editor.document.lineCount - 1).range.end;
        editor.selection = new vscode.Selection(newEndPosition, newEndPosition);
      }

      editor.revealRange(
        new vscode.Range(editor.selection.active, editor.selection.active),
        vscode.TextEditorRevealType.InCenter
      );
      break;
    }

    case 'nextBlankLine': {
      let foundBlankLine = false;
      for (let i = currentLine + 1; i < document.lineCount; i++) {
        const line = document.lineAt(i);
        if (line.text.trim().length === 0) {
          const position = line.range.start;
          editor.selection = new vscode.Selection(position, position);
          editor.revealRange(
            new vscode.Range(position, position),
            vscode.TextEditorRevealType.InCenter
          );
          foundBlankLine = true;
          break;
        }
      }

      if (!foundBlankLine) {
        await applyCursorMovement(editor, 'endOfFile');
      }
      break;
    }

    case 'stay':
    default:
      break;
  }
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

  let isBlockOpener = false;
  if (languageId === 'python' || languageId === 'ruby') {
    isBlockOpener = trimmed.endsWith(':');
  } else if (['javascript', 'typescript', 'go', 'cpp', 'csharp', 'java'].includes(languageId)) {
    isBlockOpener = trimmed.endsWith('{');
  }

  if (isBlockOpener) {
    return currentTotal + indentChar.repeat(levelSize);
  }

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
 * Normalize content indentation
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

    let normalizedRelative = relativePrefix.replace(/\t/g, indentChar.repeat(levelSize));

    normalizedLines.push(targetIndent + normalizedRelative + contentPart);
  }

  return normalizedLines.join('\n');
}

/**
 * Auto-format the current document
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
 * Type text character by character
 */
async function typeText(editor: vscode.TextEditor, text: string, speed: number): Promise<void> {
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

async function executeAction(
  action: Action,
  baseDir: string,
  globalTypingSpeed: number,
  currentMessage: string,
  updateMessage: (msg: string) => void
): Promise<void> {
  const typingSpeed = action.typingSpeed || globalTypingSpeed;

  switch (action.type) {
    case 'createFolder':
      if (!action.path) throw new Error('createFolder requires path');

      updateMessage(`$(folder) Creating folder: ${action.path}`);
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

      updateMessage(`$(file-add) Creating file: ${action.path}`);
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
      updateMessage(`$(file-code) Opening: ${action.path}`);
      const openPath = path.join(baseDir, action.path);
      const doc = await vscode.workspace.openTextDocument(openPath);
      await vscode.window.showTextDocument(doc);
      await delay(500);
      break;

    case 'writeText':
      if (!action.content) throw new Error('writeText requires content');
      const editor = vscode.window.activeTextEditor;
      if (!editor) throw new Error('No active editor');

      updateMessage(`$(edit) Writing text...`);
      await typeText(editor, action.content, typingSpeed);
      break;

    case 'insert':
      updateMessage(`$(add) Inserting code...`);
      await handleInsert(action, typingSpeed);
      break;

    case 'delete':
      updateMessage(`$(trash) Deleting code...`);
      await handleDelete(action);
      break;

    case 'replace':
      updateMessage(`$(replace) Replacing code...`);
      await handleReplace(action, typingSpeed);
      break;

    case 'highlight':
      throw new Error('Highlight should be handled in main loop');

    case 'openTerminal': {
      const termName = action.terminalName || 'Build';
      const termCwd = action.cwd ? path.join(baseDir, action.cwd) : baseDir;
      updateMessage(`$(terminal) Opening terminal: ${termName}`);
      await terminalHandler.openTerminal(termName, termCwd);
      await delay(500);
      break;
    }

    case 'runCommand': {
      if (!action.command) throw new Error('runCommand requires command');
      const termName = action.terminalName || 'Build';

      if (!terminalHandler.hasTerminal(termName)) {
        await terminalHandler.openTerminal(termName, baseDir);
      }

      updateMessage(`$(terminal) Running: ${action.command}`);

      if (action.waitForCompletion !== false) {
        const result = await terminalHandler.runCommand(termName, action.command, {
          timeout: action.timeout || 120000
        });

        if (!result.success) {
          console.warn(`Command may have failed: ${action.command}`);
        }

        console.log(`Command completed in ${result.duration}ms`);
      } else {
        terminalHandler.sendCommand(termName, action.command);
      }
      break;
    }

    case 'showTerminal': {
      const termName = action.terminalName || 'Build';
      updateMessage(`$(terminal) Showing terminal: ${termName}`);
      terminalHandler.showTerminal(termName);
      await delay(300);
      break;
    }

    case 'hideTerminal':
      updateMessage(`$(window) Hiding terminal`);
      terminalHandler.hideTerminal();
      await delay(300);
      break;

    case 'closeTerminal': {
      const termName = action.terminalName || 'Build';
      updateMessage(`$(close) Closing terminal: ${termName}`);
      terminalHandler.closeTerminal(termName);
      await delay(300);
      break;
    }

    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

/**
 * Handle insert action
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

  const matchedLine = document.lineAt(lineResult.line);
  const matchedLineText = matchedLine.text.trim();
  const languageId = document.languageId;

  // DETECT IF THIS LINE OPENS A BLOCK
  let isBlockOpener = false;
  if (languageId === 'python' || languageId === 'ruby') {
    isBlockOpener = matchedLineText.endsWith(':');
  } else if (['javascript', 'typescript', 'go', 'cpp', 'csharp', 'java', 'c'].includes(languageId)) {
    isBlockOpener = matchedLineText.endsWith('{');
  }

  let insertAfterLine = lineResult.line;

  if (isBlockOpener) {
    // FIND THE END OF THE BLOCK
    const matchedIndent = detectIndentation(matchedLine.text, options);
    const matchedIndentLevel = matchedIndent.count;

    if (languageId === 'python' || languageId === 'ruby') {
      // Python: find the first line with SAME or LESS indentation (block ended)
      for (let i = lineResult.line + 1; i < document.lineCount; i++) {
        const currentLine = document.lineAt(i);
        const currentText = currentLine.text;

        if (currentText.trim().length === 0) continue;

        const currentIndent = detectIndentation(currentText, options);

        if (currentIndent.count <= matchedIndentLevel) {
          insertAfterLine = i - 1;
          break;
        }

        if (i === document.lineCount - 1) {
          insertAfterLine = i;
        }
      }
    } else {
      // Brace languages: find matching closing brace
      let braceCount = 0;
      let foundOpening = false;

      for (let i = lineResult.line; i < document.lineCount; i++) {
        const currentText = document.lineAt(i).text;

        for (const char of currentText) {
          if (char === '{') { braceCount++; foundOpening = true; }
          else if (char === '}') {
            braceCount--;
            if (foundOpening && braceCount === 0) { insertAfterLine = i; break; }
          }
        }
        if (foundOpening && braceCount === 0) break;
      }
    }
  }

  const targetLine = document.lineAt(insertAfterLine);
  const endPosition = targetLine.range.end;

  editor.selection = new vscode.Selection(endPosition, endPosition);
  editor.revealRange(new vscode.Range(endPosition, endPosition), vscode.TextEditorRevealType.InCenter);

  await delay(300);

  // Use MATCHED line's indentation (sibling level)
  const targetIndent = detectIndentation(matchedLine.text, options).total;
  const normalizedContent = normalizeIndentation(action.content!, targetIndent, options);

  // Insert newline FIRST
  await editor.edit(editBuilder => {
    editBuilder.insert(endPosition, '\n');
  });

  const newLineNum = endPosition.line + 1;
  const newLinePosition = new vscode.Position(newLineNum, 0);
  editor.selection = new vscode.Selection(newLinePosition, newLinePosition);

  await delay(100);

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

  // NEW LOGIC: Insert newline FIRST (splitting the current line), then type in the GAP
  // But for "Insert Before", we want:
  // Old:
  // LINE N: content
  // New:
  // LINE N: <typed content>
  // LINE N+1: content

  // Implementation:
  // 1. Insert \n at start of line. (Pushes existing content down)
  await editor.edit(editBuilder => {
    editBuilder.insert(startPosition, '\n');
  });

  // 2. Move cursor UP to the newly created blank line (now at lineResult.line)
  // The previous insertion moved the original content to line+1
  const blankLinePos = new vscode.Position(lineResult.line, 0);
  editor.selection = new vscode.Selection(blankLinePos, blankLinePos);

  editor.revealRange(
    new vscode.Range(blankLinePos, blankLinePos),
    vscode.TextEditorRevealType.InCenter
  );

  await delay(300);

  // 3. Type the content
  await typeText(editor, normalizedContent, typingSpeed);

  // 4. No need to insert another newline, we already split it.
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

  // NEW LOGIC: Similar to Insert Before
  // 1. Split line first (create space)
  await editor.edit(editBuilder => {
    editBuilder.insert(position, '\n');
  });

  // 2. Move cursor to the new line
  const startPos = new vscode.Position(lineNumber, 0);
  editor.selection = new vscode.Selection(startPos, startPos);

  editor.revealRange(
    new vscode.Range(startPos, startPos),
    vscode.TextEditorRevealType.InCenter
  );

  await delay(300);

  // 3. Type content
  await typeText(editor, normalizedContent, typingSpeed);
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
  console.log('JSON Project Builder deactivating...');

  stopTimer();

  if (audioHandler) {
    audioHandler.cleanup();
  }

  if (terminalHandler) {
    terminalHandler.dispose();
  }

  if (currentHighlightDecoration) {
    currentHighlightDecoration.dispose();
    currentHighlightDecoration = null;
  }

  if (globalStatusBar) {
    globalStatusBar.dispose();
  }
}
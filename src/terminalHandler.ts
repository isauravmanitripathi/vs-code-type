// terminalHandler.ts
import * as vscode from 'vscode';

interface TerminalState {
    terminal: vscode.Terminal;
    name: string;
    busy: boolean;
}

/**
 * Manages terminal lifecycle and command execution for the JSON Project Builder
 * Note: Uses simple sendText + delay approach since onDidWriteTerminalData is a proposed API
 */
export class TerminalHandler {
    private terminals: Map<string, TerminalState> = new Map();
    private disposables: vscode.Disposable[] = [];

    constructor() {
        // Listen for terminal close events
        this.disposables.push(
            vscode.window.onDidCloseTerminal(terminal => {
                for (const [name, state] of this.terminals.entries()) {
                    if (state.terminal === terminal) {
                        this.terminals.delete(name);
                        console.log(`Terminal "${name}" was closed`);
                        break;
                    }
                }
            })
        );
    }

    /**
     * Open or create a terminal with the given name
     */
    async openTerminal(name: string, cwd?: string): Promise<vscode.Terminal> {
        // Check if terminal already exists
        let state = this.terminals.get(name);

        if (state) {
            state.terminal.show();
            return state.terminal;
        }

        // Create new terminal
        const terminal = vscode.window.createTerminal({
            name,
            cwd,
        });

        this.terminals.set(name, {
            terminal,
            name,
            busy: false
        });

        terminal.show();

        // Wait for terminal to initialize
        await this.delay(1000);

        return terminal;
    }

    /**
     * Run a command in the specified terminal
     * Uses a simple approach: send command + wait for estimated duration
     * 
     * Since we can't reliably detect command completion without the proposed API,
     * we estimate based on command type and use generous timeouts
     */
    async runCommand(
        terminalName: string,
        command: string,
        options?: { timeout?: number; showOutput?: boolean }
    ): Promise<{ success: boolean; duration: number }> {
        const state = this.terminals.get(terminalName);
        if (!state) {
            throw new Error(`Terminal "${terminalName}" not found. Call openTerminal first.`);
        }

        const terminal = state.terminal;
        const estimatedDuration = this.estimateCommandDuration(command, options?.timeout);
        const startTime = Date.now();

        // Show terminal and run command
        terminal.show();

        // Small delay before sending command (ensure terminal is focused)
        await this.delay(200);

        // Send the command
        terminal.sendText(command);

        // Wait for estimated completion time
        await this.delay(estimatedDuration);

        const duration = Date.now() - startTime;

        // We can't know if it really succeeded without the proposed API
        // So we optimistically return success
        return { success: true, duration };
    }

    /**
     * Estimate how long a command might take based on its type
     */
    private estimateCommandDuration(command: string, timeout?: number): number {
        // If user specified timeout, use a portion of it as wait time
        if (timeout) {
            // Wait for at least 2 seconds, but cap at timeout
            return Math.min(Math.max(2000, timeout / 2), timeout);
        }

        const cmd = command.toLowerCase();

        // Package manager commands - wait longer
        if (cmd.includes('npm install') || cmd.includes('yarn add') || cmd.includes('pip install')) {
            return 10000; // 10 seconds
        }

        // Build commands
        if (cmd.includes('npm run build') || cmd.includes('cargo build') || cmd.includes('make')) {
            return 8000; // 8 seconds
        }

        // Server starts (run in background)
        if (cmd.includes('npm start') || cmd.includes('npm run dev') || cmd.includes('python') && !cmd.includes('--version')) {
            return 3000; // 3 seconds to start
        }

        // Quick commands
        if (cmd.includes('ls') || cmd.includes('pwd') || cmd.includes('echo') || cmd.includes('cat') ||
            cmd.includes('--version') || cmd.includes('which') || cmd.includes('cd ')) {
            return 1500; // 1.5 seconds
        }

        // venv creation
        if (cmd.includes('venv') || cmd.includes('virtualenv')) {
            return 5000; // 5 seconds
        }

        // Activation scripts
        if (cmd.includes('source') || cmd.includes('activate')) {
            return 2000; // 2 seconds
        }

        // Default
        return 3000; // 3 seconds
    }

    /**
     * Run a command without waiting (fire and forget)
     */
    sendCommand(terminalName: string, command: string): void {
        const state = this.terminals.get(terminalName);
        if (!state) {
            throw new Error(`Terminal "${terminalName}" not found.`);
        }
        state.terminal.show();
        state.terminal.sendText(command);
    }

    /**
     * Show a terminal
     */
    showTerminal(name: string): void {
        const state = this.terminals.get(name);
        if (state) {
            state.terminal.show();
        }
    }

    /**
     * Hide terminal (focus back to editor)
     */
    hideTerminal(): void {
        // Focus back to the active editor
        if (vscode.window.activeTextEditor) {
            vscode.window.showTextDocument(vscode.window.activeTextEditor.document);
        }
    }

    /**
     * Close and dispose a terminal
     */
    closeTerminal(name: string): void {
        console.log(`[closeTerminal] Attempting to close terminal: "${name}"`);
        console.log(`[closeTerminal] Available terminals: ${Array.from(this.terminals.keys()).join(', ')}`);

        const state = this.terminals.get(name);
        if (state) {
            console.log(`[closeTerminal] Found terminal, disposing...`);
            state.terminal.dispose();
            this.terminals.delete(name);
            console.log(`[closeTerminal] Terminal "${name}" closed successfully`);
        } else {
            console.log(`[closeTerminal] Terminal "${name}" not found in map`);
        }
    }

    /**
     * Close all managed terminals
     */
    closeAll(): void {
        for (const [name, state] of this.terminals.entries()) {
            state.terminal.dispose();
        }
        this.terminals.clear();
    }

    /**
     * Check if a terminal exists
     */
    hasTerminal(name: string): boolean {
        return this.terminals.has(name);
    }

    /**
     * Get list of active terminal names
     */
    getTerminalNames(): string[] {
        return Array.from(this.terminals.keys());
    }

    /**
     * Cleanup resources
     */
    dispose(): void {
        this.closeAll();
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables = [];
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

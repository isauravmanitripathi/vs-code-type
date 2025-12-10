// httpServer.ts
// HTTP server for accepting blueprint execution requests from terminal/scripts

import * as http from 'http';
import * as vscode from 'vscode';

interface ExecuteRequest {
    path: string;
}

interface ExecuteResponse {
    success: boolean;
    message: string;
    error?: string;
}

interface StatusResponse {
    running: boolean;
    port: number;
    version: string;
}

interface ProgressResponse {
    busy: boolean;
    status: 'idle' | 'processing' | 'done' | 'error';
    blueprint?: string;
    currentAction?: string;
    progress?: {
        current: number;
        total: number;
        percentage: number;
    };
    error?: string;
}

export class HttpServer {
    private server: http.Server | null = null;
    private port: number;
    private enabled: boolean;

    // Progress tracking state
    private executionState: {
        busy: boolean;
        status: 'idle' | 'processing' | 'done' | 'error';
        blueprint: string | null;
        currentAction: string | null;
        currentStep: number;
        totalSteps: number;
        error: string | null;
    } = {
            busy: false,
            status: 'idle',
            blueprint: null,
            currentAction: null,
            currentStep: 0,
            totalSteps: 0,
            error: null
        };

    constructor(port: number = 3000, enabled: boolean = true) {
        this.port = port;
        this.enabled = enabled;
    }

    /**
     * Start the HTTP server
     */
    async start(): Promise<void> {
        if (!this.enabled) {
            console.log('[HttpServer] Server disabled in settings');
            return;
        }

        if (this.server) {
            console.log('[HttpServer] Server already running');
            return;
        }

        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => {
                this.handleRequest(req, res);
            });

            this.server.on('error', (error: NodeJS.ErrnoException) => {
                if (error.code === 'EADDRINUSE') {
                    console.error(`[HttpServer] Port ${this.port} is already in use`);
                    vscode.window.showWarningMessage(
                        `JSON Project Builder: Port ${this.port} is already in use. Server not started.`
                    );
                } else {
                    console.error('[HttpServer] Server error:', error);
                }
                reject(error);
            });

            this.server.listen(this.port, () => {
                console.log(`[HttpServer] ✅ Server started on http://localhost:${this.port}`);
                vscode.window.showInformationMessage(
                    `JSON Project Builder: HTTP server running on port ${this.port}`
                );
                resolve();
            });
        });
    }

    /**
     * Stop the HTTP server
     */
    async stop(): Promise<void> {
        if (!this.server) {
            return;
        }

        return new Promise((resolve) => {
            this.server!.close(() => {
                console.log('[HttpServer] Server stopped');
                this.server = null;
                resolve();
            });
        });
    }

    /**
     * Handle incoming HTTP requests
     */
    private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
        // Enable CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        // Handle OPTIONS preflight
        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        const url = req.url || '/';

        // GET /status - Check server status
        if (req.method === 'GET' && url === '/status') {
            this.handleStatus(req, res);
            return;
        }

        // GET /progress - Check execution progress
        if (req.method === 'GET' && url === '/progress') {
            this.handleProgress(req, res);
            return;
        }

        // POST /execute - Execute blueprint
        if (req.method === 'POST' && url === '/execute') {
            this.handleExecute(req, res);
            return;
        }

        // 404 Not Found
        this.sendResponse(res, 404, {
            success: false,
            message: 'Not Found',
            error: `Endpoint ${req.method} ${url} not found`
        });
    }

    /**
     * Handle GET /status
     */
    private handleStatus(req: http.IncomingMessage, res: http.ServerResponse): void {
        const response: StatusResponse = {
            running: true,
            port: this.port,
            version: '0.0.1'
        };

        this.sendResponse(res, 200, response);
    }

    /**
     * Handle GET /progress
     */
    private handleProgress(req: http.IncomingMessage, res: http.ServerResponse): void {
        const response: ProgressResponse = {
            busy: this.executionState.busy,
            status: this.executionState.status
        };

        // Add details if currently processing
        if (this.executionState.busy || this.executionState.status !== 'idle') {
            response.blueprint = this.executionState.blueprint || undefined;
            response.currentAction = this.executionState.currentAction || undefined;

            if (this.executionState.totalSteps > 0) {
                response.progress = {
                    current: this.executionState.currentStep,
                    total: this.executionState.totalSteps,
                    percentage: Math.round((this.executionState.currentStep / this.executionState.totalSteps) * 100)
                };
            }
        }

        // Add error if present
        if (this.executionState.error) {
            response.error = this.executionState.error;
        }

        this.sendResponse(res, 200, response);
    }

    /**
     * Handle POST /execute
     */
    private handleExecute(req: http.IncomingMessage, res: http.ServerResponse): void {
        let body = '';

        req.on('data', (chunk) => {
            body += chunk.toString();
        });

        req.on('end', async () => {
            try {
                // Parse JSON body
                const data: ExecuteRequest = JSON.parse(body);

                if (!data.path) {
                    this.sendResponse(res, 400, {
                        success: false,
                        message: 'Bad Request',
                        error: 'Missing "path" field in request body'
                    });
                    return;
                }

                // Validate path
                if (!data.path.endsWith('.json')) {
                    this.sendResponse(res, 400, {
                        success: false,
                        message: 'Bad Request',
                        error: 'Path must point to a .json file'
                    });
                    return;
                }

                console.log(`[HttpServer] Received execute request for: ${data.path}`);

                // Execute the blueprint via VS Code command
                // This is non-blocking - we respond immediately
                void vscode.commands.executeCommand('json-project-builder.buildFromJson', data.path)
                    .then(() => {
                        console.log(`[HttpServer] Blueprint execution started successfully`);
                    }, (error: Error) => {
                        console.error(`[HttpServer] Blueprint execution error:`, error);
                        vscode.window.showErrorMessage(`Blueprint execution failed: ${error.message}`);
                    });

                // Send immediate response
                this.sendResponse(res, 202, {
                    success: true,
                    message: 'Blueprint execution started',
                });

            } catch (error) {
                console.error('[HttpServer] Error parsing request:', error);
                this.sendResponse(res, 400, {
                    success: false,
                    message: 'Bad Request',
                    error: error instanceof Error ? error.message : 'Invalid JSON'
                });
            }
        });

        req.on('error', (error) => {
            console.error('[HttpServer] Request error:', error);
            this.sendResponse(res, 500, {
                success: false,
                message: 'Internal Server Error',
                error: error.message
            });
        });
    }

    /**
     * Send JSON response
     */
    private sendResponse(res: http.ServerResponse, statusCode: number, data: any): void {
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data, null, 2));
    }

    /**
     * Check if server is running
     */
    isRunning(): boolean {
        return this.server !== null;
    }

    /**
     * Get current port
     */
    getPort(): number {
        return this.port;
    }

    /**
     * Update execution state (called from extension)
     */
    updateProgress(state: Partial<typeof this.executionState>): void {
        Object.assign(this.executionState, state);
        console.log('[HttpServer] Progress updated:', this.executionState);
    }

    /**
     * Reset execution state to idle
     */
    resetProgress(): void {
        this.executionState = {
            busy: false,
            status: 'idle',
            blueprint: null,
            currentAction: null,
            currentStep: 0,
            totalSteps: 0,
            error: null
        };
        console.log('[HttpServer] Progress reset to idle');
    }
}

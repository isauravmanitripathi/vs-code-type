// statusReporter.ts
// Non-blocking HTTP reporter for extension → Python communication

import * as http from 'http';

export interface StatusPayload {
    event: 'started' | 'action_start' | 'action_complete' | 'action_error' | 'blueprint_done' | 'all_done' | 'error';
    blueprint?: string;
    step?: number;
    total?: number;
    action?: string;
    success?: boolean;
    error?: string;
    timestamp: number;
}

export class StatusReporter {
    private serverUrl: string;
    private port: number;
    private enabled: boolean = true;

    constructor(serverUrl: string = 'http://localhost:5555') {
        this.serverUrl = serverUrl;
        // Parse port from URL
        const match = serverUrl.match(/:(\d+)/);
        this.port = match ? parseInt(match[1], 10) : 5555;
    }

    /**
     * Send a status update to the Python server (fire-and-forget)
     * Never throws errors - silently fails if server unavailable
     */
    private send(payload: StatusPayload): void {
        if (!this.enabled) return;

        const data = JSON.stringify(payload);

        const options: http.RequestOptions = {
            hostname: 'localhost',
            port: this.port,
            path: '/status',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            },
            timeout: 1000 // 1 second timeout
        };

        const req = http.request(options, (res) => {
            // Just consume the response
            res.resume();
        });

        // Silently ignore all errors
        req.on('error', () => {
            // Server not running or network error - silently continue
        });

        req.on('timeout', () => {
            req.destroy();
        });

        req.write(data);
        req.end();
    }

    /**
     * Report that blueprint processing has started
     */
    reportStart(blueprint: string, totalActions: number): void {
        this.send({
            event: 'started',
            blueprint,
            total: totalActions,
            timestamp: Date.now()
        });
        console.log(`[StatusReporter] Started: ${blueprint} (${totalActions} actions)`);
    }

    /**
     * Report action starting
     */
    reportActionStart(step: number, total: number, action: string): void {
        this.send({
            event: 'action_start',
            step,
            total,
            action,
            timestamp: Date.now()
        });
    }

    /**
     * Report action completed successfully
     */
    reportActionComplete(step: number, total: number): void {
        this.send({
            event: 'action_complete',
            step,
            total,
            success: true,
            timestamp: Date.now()
        });
    }

    /**
     * Report action failed with error
     */
    reportActionError(step: number, total: number, action: string, error: string): void {
        this.send({
            event: 'action_error',
            step,
            total,
            action,
            error,
            success: false,
            timestamp: Date.now()
        });
    }

    /**
     * Report single blueprint completed
     */
    reportBlueprintDone(blueprint: string, success: boolean): void {
        this.send({
            event: 'blueprint_done',
            blueprint,
            success,
            timestamp: Date.now()
        });
    }

    /**
     * Report all processing completed
     */
    reportAllDone(successCount: number, failCount: number): void {
        this.send({
            event: 'all_done',
            success: failCount === 0,
            total: successCount + failCount,
            step: successCount, // Reuse step field for success count
            timestamp: Date.now()
        });
        console.log(`[StatusReporter] All done: ${successCount} succeeded, ${failCount} failed`);
    }

    /**
     * Report a general error
     */
    reportError(error: string): void {
        this.send({
            event: 'error',
            error,
            timestamp: Date.now()
        });
    }

    /**
     * Disable reporting (for testing or when not needed)
     */
    disable(): void {
        this.enabled = false;
    }

    /**
     * Enable reporting
     */
    enable(): void {
        this.enabled = true;
    }
}

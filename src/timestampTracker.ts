// timestampTracker.ts
import * as fs from 'fs';
import * as path from 'path';

interface TimestampEntry {
  startTime: number;
  endTime?: number;
  fileName: string;
  displayName: string;
}

export class TimestampTracker {
  private startTime: number = 0;
  private entries: TimestampEntry[] = [];
  private outputFolder: string = '';
  private hasIntroEntry: boolean = false;

  /**
   * Initialize the tracker and start the master timer
   */
  start(folderPath: string, addIntroEntry: boolean = true): void {
    this.startTime = Date.now();
    this.entries = [];
    this.outputFolder = folderPath;
    this.hasIntroEntry = addIntroEntry;
    
    // Add initial "Start" or "Introduction" entry if requested
    if (addIntroEntry) {
      this.entries.push({
        startTime: 0,
        fileName: '__intro__',
        displayName: 'Introduction'
      });
    }
    
    console.log('Timestamp tracker started');
  }

  /**
   * Record the start of a blueprint
   */
  recordBlueprintStart(fileName: string): void {
    const elapsed = Date.now() - this.startTime;
    
    // If this is the first blueprint and we have an intro entry, set its end time
    if (this.hasIntroEntry && this.entries.length === 1 && this.entries[0].fileName === '__intro__') {
      this.entries[0].endTime = elapsed;
    }
    
    // Get display name (remove .json extension and clean up)
    const displayName = this.getDisplayName(fileName);
    
    this.entries.push({
      startTime: elapsed,
      fileName: fileName,
      displayName: displayName
    });
    
    console.log(`Recorded start: ${displayName} at ${this.formatTimestamp(elapsed)}`);
  }

  /**
   * Record the end of the current blueprint
   */
  recordBlueprintEnd(): void {
    if (this.entries.length === 0) return;
    
    // Find the last non-intro entry
    const currentEntry = this.entries[this.entries.length - 1];
    if (!currentEntry.endTime && currentEntry.fileName !== '__intro__') {
      currentEntry.endTime = Date.now() - this.startTime;
      console.log(`Recorded end: ${currentEntry.displayName} at ${this.formatTimestamp(currentEntry.endTime)}`);
    }
  }

  /**
   * Get display name from filename
   * Removes .json extension and formats nicely
   */
  private getDisplayName(fileName: string): string {
    // Remove .json extension
    let name = fileName.replace('.json', '');
    
    // Remove number prefixes like "01-", "1-", etc.
    name = name.replace(/^\d+-/, '');
    
    // Replace hyphens and underscores with spaces
    name = name.replace(/[-_]/g, ' ');
    
    // Capitalize first letter of each word
    name = name.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    return name;
  }

  /**
   * Format milliseconds to MM:SS or HH:MM:SS
   */
  private formatTimestamp(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
      return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
  }

  /**
   * Get current elapsed time formatted as [HH:MM:SS]
   * Can be called anytime during execution
   */
  getElapsedFormatted(): string {
    if (this.startTime === 0) {
      return '[00:00:00]';
    }
    
    const elapsed = Date.now() - this.startTime;
    const totalSeconds = Math.floor(elapsed / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `[${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}]`;
  }

  /**
   * Generate and save the timestamps file
   */
  saveTimestamps(): void {
    if (this.entries.length === 0) {
      console.log('No timestamps to save');
      return;
    }

    // Build the timestamp content
    const lines: string[] = [];
    
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      const startFormatted = this.formatTimestamp(entry.startTime);
      
      // Use end time if available, otherwise use start of next entry or current time
      let endTime: number;
      if (entry.endTime) {
        endTime = entry.endTime;
      } else if (i < this.entries.length - 1) {
        endTime = this.entries[i + 1].startTime;
      } else {
        endTime = Date.now() - this.startTime;
      }
      
      const endFormatted = this.formatTimestamp(endTime);
      
      lines.push(`${startFormatted} - ${endFormatted} ${entry.displayName}`);
    }

    // Join all lines
    const content = lines.join('\n');

    // Save to timestamps.txt in the folder
    const timestampPath = path.join(this.outputFolder, 'timestamps.txt');
    
    try {
      fs.writeFileSync(timestampPath, content, 'utf-8');
      console.log(`Timestamps saved to: ${timestampPath}`);
    } catch (error) {
      console.error('Error saving timestamps:', error);
    }
  }

  /**
   * Get the current elapsed time (for display purposes)
   */
  getCurrentElapsed(): string {
    const elapsed = Date.now() - this.startTime;
    return this.formatTimestamp(elapsed);
  }

  /**
   * Reset the tracker
   */
  reset(): void {
    this.startTime = 0;
    this.entries = [];
    this.outputFolder = '';
    this.hasIntroEntry = false;
  }
}
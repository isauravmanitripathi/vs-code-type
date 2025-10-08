// audioHandler.ts
import * as fs from 'fs';
import { exec } from 'child_process';
import { AudioCacheManager } from './audioCacheManager';

export class AudioHandler {
  private cacheManager: AudioCacheManager;

  constructor() {
    this.cacheManager = new AudioCacheManager();
  }

  /**
   * Get the cache manager instance
   */
  getCacheManager(): AudioCacheManager {
    return this.cacheManager;
  }

  /**
   * Play voiceover using pre-cached audio and delete it after use
   */
  async playVoiceover(
    text: string, 
    voice: string = 'en-US-AriaNeural',
    timing: 'before' | 'after' | 'during' = 'before'
  ): Promise<void> {
    try {
      console.log('Playing voiceover:', text.substring(0, 50) + '...');

      // Get audio from cache (will wait if still generating)
      const audioFile = await this.cacheManager.getAudioPath(text, voice);

      if (!audioFile) {
        console.warn('Audio file not available, skipping voiceover');
        return;
      }

      // Play the audio
      await this.playAudioFile(audioFile);
      console.log('Audio playback completed');

      // Delete the audio file after use
      this.cacheManager.deleteAudioFile(text, voice);

      // Small delay after audio
      await this.delay(300);

    } catch (error) {
      console.error('Voiceover error:', error);
      // Even on error, try to delete the file
      try {
        this.cacheManager.deleteAudioFile(text, voice);
      } catch (deleteError) {
        console.error('Error deleting audio file after error:', deleteError);
      }
      // Don't throw - continue execution even if audio fails
    }
  }

  /**
   * Play audio file using system player
   */
  private async playAudioFile(filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(filePath)) {
        reject(new Error('Audio file not found'));
        return;
      }

      const stats = fs.statSync(filePath);
      console.log('Audio file size:', stats.size, 'bytes');

      if (stats.size === 0) {
        reject(new Error('Audio file is empty'));
        return;
      }

      let command: string;

      // Choose audio player based on platform
      if (process.platform === 'darwin') {
        // macOS - try mpv first, fallback to afplay
        command = `mpv --no-video --really-quiet "${filePath}" 2>/dev/null || afplay "${filePath}"`;
      } else if (process.platform === 'win32') {
        // Windows
        command = `powershell -c "(New-Object Media.SoundPlayer '${filePath}').PlaySync()"`;
      } else {
        // Linux
        command = `mpv --no-video --really-quiet "${filePath}" 2>/dev/null || ffplay -nodisp -autoexit "${filePath}" 2>/dev/null`;
      }

      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error('Audio playback error:', error);
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Clean up all temporary files and cache
   */
  cleanup(): void {
    this.cacheManager.cleanup();
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
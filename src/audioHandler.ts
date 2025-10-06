import { UniversalEdgeTTS } from 'edge-tts-universal';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';

export class AudioHandler {
  private tempDir: string;

  constructor() {
    this.tempDir = path.join(os.tmpdir(), 'vscode-tutorial-audio');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Generate and play voiceover using EdgeTTS
   */
  async playVoiceover(
    text: string, 
    voice: string = 'en-US-AriaNeural',
    timing: 'before' | 'after' | 'during' = 'before'
  ): Promise<void> {
    const audioFile = path.join(this.tempDir, `audio_${Date.now()}.mp3`);

    try {
      console.log('Generating audio:', text.substring(0, 50) + '...');

      // Generate audio using edge-tts-universal
      const tts = new UniversalEdgeTTS(text, voice);
      const result = await tts.synthesize();

      if (!result.audio) {
        throw new Error('No audio data received from EdgeTTS');
      }

      // Convert Blob to Buffer for Node.js
      let audioBuffer: Buffer;
      if (result.audio instanceof Blob) {
        const arrayBuffer = await result.audio.arrayBuffer();
        audioBuffer = Buffer.from(arrayBuffer);
      } else {
        audioBuffer = Buffer.from(result.audio);
      }

      // Save audio to temp file for playback
      fs.writeFileSync(audioFile, audioBuffer);
      console.log('Audio file created:', audioFile, 'Size:', audioBuffer.length, 'bytes');

      // Play the audio
      await this.playAudioFile(audioFile);
      console.log('Audio playback completed');

      // Small delay after audio
      await this.delay(300);

    } catch (error) {
      console.error('Voiceover error:', error);
      throw error;
    } finally {
      // Clean up the temp playback file
      this.cleanupAudioFile(audioFile);
    }
  }

  /**
   * Play audio file using system player
   */
  private async playAudioFile(filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
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
   * Clean up temporary audio file
   */
  private cleanupAudioFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('Cleaned up audio file:', filePath);
      }
    } catch (error) {
      console.error('Error cleaning up audio file:', error);
    }
  }

  /**
   * Clean up all temporary files
   */
  cleanup(): void {
    try {
      if (fs.existsSync(this.tempDir)) {
        fs.rmSync(this.tempDir, { recursive: true, force: true });
        console.log('Cleaned up temp directory');
      }
    } catch (error) {
      console.error('Error cleaning up temp directory:', error);
    }
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
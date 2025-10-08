// audioCacheManager.ts
import { UniversalEdgeTTS } from 'edge-tts-universal';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

interface AudioCacheEntry {
  key: string;
  text: string;
  voice: string;
  status: 'pending' | 'ready' | 'failed';
  filePath?: string;
  error?: string;
}

interface VoiceoverRequest {
  text: string;
  voice: string;
}

export class AudioCacheManager {
  private cache: Map<string, AudioCacheEntry> = new Map();
  private tempDir: string;
  private generationPromises: Map<string, Promise<void>> = new Map();

  constructor() {
    this.tempDir = path.join(os.tmpdir(), 'vscode-tutorial-audio-cache');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Generate a unique key for text + voice combination
   */
  private generateKey(text: string, voice: string): string {
    const hash = crypto.createHash('md5').update(`${text}-${voice}`).digest('hex');
    return hash;
  }

  /**
   * Pre-generate audio for all voiceovers in parallel (NON-BLOCKING)
   * Returns immediately and generates in background
   */
  async pregenerateAll(requests: VoiceoverRequest[]): Promise<void> {
    console.log(`Starting parallel audio generation for ${requests.length} voiceovers...`);

    // Create cache entries for all requests
    const uniqueRequests: VoiceoverRequest[] = [];
    for (const request of requests) {
      const key = this.generateKey(request.text, request.voice);
      
      if (!this.cache.has(key)) {
        this.cache.set(key, {
          key,
          text: request.text,
          voice: request.voice,
          status: 'pending'
        });
        uniqueRequests.push(request);
      }
    }

    console.log(`${uniqueRequests.length} unique voiceovers to generate in parallel`);

    // Start generating all audio files in parallel (don't wait)
    const promises = uniqueRequests.map(request => 
      this.generateAudio(request.text, request.voice)
    );

    // Wait for all to complete (or fail) - runs in background
    await Promise.allSettled(promises);

    const ready = Array.from(this.cache.values()).filter(e => e.status === 'ready').length;
    const failed = Array.from(this.cache.values()).filter(e => e.status === 'failed').length;
    
    console.log(`Audio generation complete: ${ready} ready, ${failed} failed`);
  }

  /**
   * Generate a single audio file
   */
  private async generateAudio(text: string, voice: string): Promise<void> {
    const key = this.generateKey(text, voice);
    const entry = this.cache.get(key);
    
    if (!entry) {
      throw new Error('Cache entry not found');
    }

    // Check if already generating
    const existingPromise = this.generationPromises.get(key);
    if (existingPromise) {
      return existingPromise;
    }

    // Create generation promise
    const promise = this._generateAudioInternal(text, voice, key);
    this.generationPromises.set(key, promise);

    try {
      await promise;
    } finally {
      this.generationPromises.delete(key);
    }
  }

  /**
   * Internal audio generation logic
   */
  private async _generateAudioInternal(text: string, voice: string, key: string): Promise<void> {
    const entry = this.cache.get(key);
    if (!entry) return;

    try {
      console.log(`Generating audio for: ${text.substring(0, 50)}...`);

      const audioFile = path.join(this.tempDir, `${key}.mp3`);

      // Generate audio using EdgeTTS
      const tts = new UniversalEdgeTTS(text, voice);
      const result = await tts.synthesize();

      if (!result.audio) {
        throw new Error('No audio data received from EdgeTTS');
      }

      // Convert Blob to Buffer
      let audioBuffer: Buffer;
      if (result.audio instanceof Blob) {
        const arrayBuffer = await result.audio.arrayBuffer();
        audioBuffer = Buffer.from(arrayBuffer);
      } else {
        audioBuffer = Buffer.from(result.audio);
      }

      // Save to file
      fs.writeFileSync(audioFile, audioBuffer);

      // Update cache entry
      entry.status = 'ready';
      entry.filePath = audioFile;

      console.log(`✓ Audio ready: ${text.substring(0, 50)}... (${audioBuffer.length} bytes)`);
    } catch (error) {
      console.error(`✗ Audio generation failed: ${text.substring(0, 50)}...`, error);
      entry.status = 'failed';
      entry.error = String(error);
    }
  }

  /**
   * Get audio file path (wait if still generating)
   */
  async getAudioPath(text: string, voice: string): Promise<string | null> {
    const key = this.generateKey(text, voice);
    const entry = this.cache.get(key);

    if (!entry) {
      // Not pre-generated, generate on-demand
      console.warn('Audio not pre-generated, generating on-demand:', text.substring(0, 50));
      await this.generateAudio(text, voice);
      return this.getAudioPath(text, voice);
    }

    // If still pending, wait for generation
    if (entry.status === 'pending') {
      const promise = this.generationPromises.get(key);
      if (promise) {
        await promise;
      }
    }

    if (entry.status === 'ready' && entry.filePath) {
      return entry.filePath;
    }

    if (entry.status === 'failed') {
      console.error('Audio generation failed:', entry.error);
      return null;
    }

    return null;
  }

  /**
   * Delete audio file after it's been used
   */
  deleteAudioFile(text: string, voice: string): void {
    const key = this.generateKey(text, voice);
    const entry = this.cache.get(key);

    if (entry && entry.filePath && fs.existsSync(entry.filePath)) {
      try {
        fs.unlinkSync(entry.filePath);
        console.log(`🗑️  Deleted audio file: ${text.substring(0, 50)}...`);
      } catch (error) {
        console.error('Error deleting audio file:', error);
      }
    }

    // Remove from cache
    this.cache.delete(key);
  }

  /**
   * Get generation progress
   */
  getProgress(): { total: number; ready: number; pending: number; failed: number } {
    const entries = Array.from(this.cache.values());
    return {
      total: entries.length,
      ready: entries.filter(e => e.status === 'ready').length,
      pending: entries.filter(e => e.status === 'pending').length,
      failed: entries.filter(e => e.status === 'failed').length
    };
  }

  /**
   * Check if all audio is ready
   */
  isAllReady(): boolean {
    const entries = Array.from(this.cache.values());
    return entries.every(e => e.status === 'ready' || e.status === 'failed');
  }

  /**
   * Clean up all cached audio files
   */
  cleanup(): void {
    try {
      if (fs.existsSync(this.tempDir)) {
        fs.rmSync(this.tempDir, { recursive: true, force: true });
        console.log('Audio cache cleaned up');
      }
    } catch (error) {
      console.error('Error cleaning up audio cache:', error);
    }
    
    this.cache.clear();
    this.generationPromises.clear();
  }

  /**
   * Clear cache and delete all remaining audio files
   */
  reset(): void {
    // Delete all remaining audio files
    for (const entry of this.cache.values()) {
      if (entry.filePath && fs.existsSync(entry.filePath)) {
        try {
          fs.unlinkSync(entry.filePath);
          console.log(`🗑️  Cleaned up: ${entry.text.substring(0, 50)}...`);
        } catch (error) {
          console.error('Error deleting audio file during reset:', error);
        }
      }
    }
    
    this.cache.clear();
    this.generationPromises.clear();
  }
}
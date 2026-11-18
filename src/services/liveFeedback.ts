import type { TemporalResult } from './temporalPose';

/** Speak stable corrections without interrupting speech on every camera frame. */
export class LiveFeedback {
  private message = '';
  private since = 0;
  private lastSample = -Infinity;
  private lastSpoken = -Infinity;
  private announced = new Set<string>();

  update(result: TemporalResult, now: number): string | null {
    if (!Number.isFinite(now) || now <= this.lastSample) return null;
    const gap = now - this.lastSample;
    this.lastSample = now;
    const message = result.status === 'adjust' || result.status === 'tracking' ? result.message : '';
    if (message !== this.message || gap > 500) {
      this.message = message;
      this.since = now;
    }
    if (!message || this.announced.has(message) || now - this.since < 500 || now - this.lastSpoken < 5000) return null;
    this.lastSpoken = now;
    this.announced.add(message);
    return message;
  }
}

/** Audio is created/resumed only from an explicit user gesture. */
export class CompletionSound {
  private context: AudioContext | null = null;

  async prepare(): Promise<boolean> {
    try {
      const Audio = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Audio) return false;
      this.context ??= new Audio();
      if (this.context.state === 'suspended') await this.context.resume();
      return this.context.state === 'running';
    } catch { return false; }
  }

  play(): boolean {
    try {
      const context = this.context;
      if (!context || context.state !== 'running') return false;
      for (const [index, frequency] of [523.25, 659.25, 783.99].entries()) {
        const time = context.currentTime + index * 0.22;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.065, time + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.9);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(time);
        oscillator.stop(time + 1);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      }
      return true;
    } catch { return false; }
  }
}

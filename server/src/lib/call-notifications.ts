/**
 * Call Notifications - Handle incoming call notifications with sound and vibration
 */

export class CallNotificationService {
  private static instance: CallNotificationService;
  private audioContext: AudioContext | null = null;
  private ringtone: HTMLAudioElement | null = null;
  private vibrationInterval: NodeJS.Timeout | null = null;

  static getInstance(): CallNotificationService {
    if (!CallNotificationService.instance) {
      CallNotificationService.instance = new CallNotificationService();
    }
    return CallNotificationService.instance;
  }

  private constructor() {
    try {
      this.initializeAudio();
    } catch (error) {
      console.debug('Audio initialization failed:', error);
    }
  }

  private initializeAudio() {
    if (typeof window === 'undefined') return;

    try {
      // Create a simple ringtone using Web Audio API
      if (window.AudioContext || (window as any).webkitAudioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      // Create HTML audio element as fallback
      if (typeof Audio !== 'undefined') {
        this.ringtone = new Audio();
        this.ringtone.loop = true;
        this.ringtone.volume = 0.7;
        
        // Generate simple ringtone melody
        this.generateRingtone();
      }
    } catch (error) {
      console.warn('Audio context not available:', error);
    }
  }

  private generateRingtone() {
    try {
      // Create a data URL for a simple ringtone melody
      const sampleRate = 44100;
      const duration = 2; // 2 seconds
      const buffer = new ArrayBuffer(44 + sampleRate * duration * 2);
    const view = new DataView(buffer);
    
    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + sampleRate * duration * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, sampleRate * duration * 2, true);
    
    // Generate ringtone audio data (pleasant ascending/descending tones)
    let offset = 44;
    for (let i = 0; i < sampleRate * duration; i++) {
      const t = i / sampleRate;
      let sample = 0;
      
      // Create a phone-like ringtone pattern
      if (t < 0.5) {
        sample = Math.sin(2 * Math.PI * 800 * t) * 0.3; // 800Hz
      } else if (t < 1.0) {
        sample = Math.sin(2 * Math.PI * 1000 * t) * 0.3; // 1000Hz
      } else if (t < 1.5) {
        sample = Math.sin(2 * Math.PI * 800 * t) * 0.3; // Back to 800Hz
      } else {
        sample = Math.sin(2 * Math.PI * 1000 * t) * 0.3; // 1000Hz again
      }
      
      // Add some harmonic richness
      sample += Math.sin(2 * Math.PI * 1200 * t) * 0.1;
      
      // Apply envelope to prevent clicks
      const envelope = Math.sin(Math.PI * (i / (sampleRate * duration)));
      sample *= envelope * 0.5;
      
      const intSample = Math.max(-32767, Math.min(32767, Math.floor(sample * 32767)));
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
    
      const blob = new Blob([buffer], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      
      if (this.ringtone) {
        this.ringtone.src = url;
      }
    } catch (error) {
      console.debug('Ringtone generation failed:', error);
    }
  }

  async playRingtone(): Promise<void> {
    if (!this.ringtone) return;

    try {
      // Resume audio context if suspended (required by some browsers)
      if (this.audioContext?.state === 'suspended') {
        await this.audioContext.resume();
      }

      await this.ringtone.play();
    } catch (error) {
      console.warn('Could not play ringtone:', error);
    }
  }

  stopRingtone(): void {
    if (this.ringtone) {
      this.ringtone.pause();
      this.ringtone.currentTime = 0;
    }
  }

  startVibration(): void {
    if (typeof navigator === 'undefined' || !navigator.vibrate) return;

    // Vibrate in a pattern: 500ms on, 300ms off, 500ms on, repeat
    const pattern = [500, 300, 500, 300];
    
    this.vibrationInterval = setInterval(() => {
      navigator.vibrate(pattern);
    }, 1600); // Total pattern duration

    // Initial vibration
    navigator.vibrate(pattern);
  }

  stopVibration(): void {
    if (this.vibrationInterval) {
      clearInterval(this.vibrationInterval);
      this.vibrationInterval = null;
    }

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(0); // Stop vibration
    }
  }

  async showNotification(callerName: string): Promise<void> {
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    // Request permission if not granted
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }

    if (Notification.permission === 'granted') {
      const notification = new Notification(`Incoming Call from ${callerName}`, {
        body: 'Tap to answer the call',
        icon: '/img/logo.png',
        badge: '/img/logo.png',
        tag: 'incoming-call',
        requireInteraction: true,
      });

      // Handle vibration separately
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator && navigator.vibrate) {
        try {
          navigator.vibrate([500, 300, 500]);
        } catch (e) {
          console.debug('Vibration not supported:', e);
        }
      }

      return new Promise((resolve) => {
        notification.onclick = () => {
          window.focus();
          notification.close();
          resolve();
        };

        // Auto-close after 30 seconds
        setTimeout(() => {
          notification.close();
          resolve();
        }, 30000);
      });
    }
  }

  async startIncomingCallAlert(callerName: string, receiverUid?: string): Promise<void> {
    // Play ringtone
    await this.playRingtone();
    
    // Start vibration
    this.startVibration();
    
    // Show system notification
    await this.showNotification(callerName);
    
    // Send push notification via backend
    await this.sendPushNotification(callerName, receiverUid);
  }

  async sendPushNotification(callerName: string, receiverUid?: string): Promise<void> {
    try {
      const body: any = {
        title: `📞 Incoming Call`,
        message: `${callerName} is calling you`,
        type: 'call',
        data: { callerName, timestamp: Date.now() }
      };
      
      // Target specific user if receiverUid provided
      if (receiverUid) {
        body.targetUids = [receiverUid];
      }
      
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch (error) {
      console.warn('[CALL] Push notification failed:', error);
    }
  }

  stopIncomingCallAlert(): void {
    this.stopRingtone();
    this.stopVibration();
    
    // Close any existing notifications
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.getNotifications({ tag: 'incoming-call' }).then((notifications) => {
          notifications.forEach((notification) => notification.close());
        });
      });
    }
  }

  // Request permissions on app load
  async requestPermissions(): Promise<void> {
    if (typeof window === 'undefined') return;

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      console.log('[CALL] Notification permission requested:', permission);
      
      // Show user-friendly message on mobile
      if (permission === 'granted') {
        this.showWelcomeNotification();
      } else if (permission === 'denied') {
        console.warn('[CALL] Notifications denied - call alerts may not work');
      }
    }

    // Test vibration support
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator && navigator.vibrate) {
      try {
        navigator.vibrate(50); // Quick test vibration
      } catch (e) {
        console.debug('Vibration test failed:', e);
      }
    }
  }

  private showWelcomeNotification(): void {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    
    // Show a welcome notification to confirm it's working
    try {
      new Notification('📞 Call Notifications Enabled', {
        body: 'You\'ll now receive call alerts',
        icon: '/img/logo.png',
        tag: 'welcome-call'
      });
    } catch (e) {
      console.debug('Welcome notification failed:', e);
    }
  }
}

export const callNotifications = CallNotificationService.getInstance();
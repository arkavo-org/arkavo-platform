class VoiceRecorder {
    constructor() {
        this.recognition = null;
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.isRecording = false;
        this.silenceTimer = null;
        this.volumeCheckInterval = null;
        this.restartTimer = null;

        // Advanced VAD variables
        this.speechStartTime = null;
        this.lastSpeechTime = null;
        this.energyBuffer = [];
        this.bufferSize = 20;
        this.baselineEnergy = 0;
        this.adaptiveThreshold = 0.02;
        this.isSpeaking = false;
        this.speechStarted = false;

        // Speech recognition variables
        this.finalTranscript = '';
        this.interimTranscript = '';
        this.speechRecognitionActive = false;

        this.initializeElements();
        this.setupEventListeners();
        this.checkBrowserSupport();
    }

    checkBrowserSupport() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            this.showError('Speech recognition not supported in this browser. Please use Chrome, Edge, or Safari.');
            this.micButton.disabled = true;
            return false;
        }
        return true;
    }

    initializeElements() {
        this.micButton = document.getElementById('micButton');
        this.status = document.getElementById('status');
        this.volumeBar = document.getElementById('volumeBar');
        this.energyThreshold = document.getElementById('energyThreshold');
        this.silenceDuration = document.getElementById('silenceDuration');
        this.minSpeechDuration = document.getElementById('minSpeechDuration');
        this.language = document.getElementById('language');
        this.task = document.getElementById('task');
        this.error = document.getElementById('error');
        this.transcription = document.getElementById('transcription');
        this.transcriptionText = document.getElementById('transcriptionText');
        this.vadLight = document.getElementById('vadLight');
        this.vadStatus = document.getElementById('vadStatus');
    }

    setupEventListeners() {
        this.micButton.addEventListener('click', () => {
            if (!this.isRecording) {
                this.startRecording();
            } else {
                this.stopRecording();
            }
        });
    }

    async startRecording() {
        try {
            this.clearError();
            this.hideTranscription();

            // Request microphone access for VAD monitoring
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 44100
                }
            });

            // Setup audio context for advanced VAD
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            this.microphone.connect(this.analyser);

            this.analyser.fftSize = 2048;
            this.analyser.smoothingTimeConstant = 0.3;

            // Setup speech recognition
            this.setupSpeechRecognition();

            this.isRecording = true;
            this.updateUI('recording');

            // Reset VAD variables
            this.speechStartTime = null;
            this.lastSpeechTime = null;
            this.energyBuffer = [];
            this.baselineEnergy = 0;
            this.isSpeaking = false;
            this.speechStarted = false;
            this.finalTranscript = '';
            this.interimTranscript = '';

            // Start intelligent VAD monitoring
            this.startIntelligentVAD();

            // Start speech recognition
            this.startSpeechRecognition();

        } catch (error) {
            this.showError('Error accessing microphone: ' + error.message);
        }
    }

    setupSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();

        // Configure recognition
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 1;

        // Set language
        const selectedLanguage = this.language.value || 'en-US';
        this.recognition.lang = selectedLanguage;

        // Event handlers
        this.recognition.onstart = () => {
            this.speechRecognitionActive = true;
            console.log('Speech recognition started');
        };

        this.recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = this.finalTranscript;

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript + ' ';
                } else {
                    interimTranscript += transcript;
                }
            }

            this.finalTranscript = finalTranscript;
            this.interimTranscript = interimTranscript;

            // Update display with both final and interim results
            const displayText = (finalTranscript + interimTranscript).trim();
            if (displayText) {
                this.showTranscription(displayText, !interimTranscript);
            }
        };

        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            
            // Handle specific errors
            switch (event.error) {
                case 'network':
                    this.showError('Network error during speech recognition');
                    break;
                case 'not-allowed':
                    this.showError('Microphone access denied');
                    break;
                case 'no-speech':
                    // This is normal, just restart recognition
                    this.restartRecognitionAfterDelay();
                    break;
                default:
                    this.showError('Speech recognition error: ' + event.error);
            }
        };

        this.recognition.onend = () => {
            this.speechRecognitionActive = false;
            console.log('Speech recognition ended');
            
            // Restart recognition if we're still recording
            if (this.isRecording) {
                this.restartRecognitionAfterDelay();
            }
        };
    }

    startSpeechRecognition() {
        if (this.recognition && !this.speechRecognitionActive) {
            try {
                this.recognition.start();
            } catch (error) {
                console.error('Error starting speech recognition:', error);
                this.restartRecognitionAfterDelay();
            }
        }
    }

    restartRecognitionAfterDelay() {
        if (this.restartTimer) {
            clearTimeout(this.restartTimer);
        }

        this.restartTimer = setTimeout(() => {
            if (this.isRecording && !this.speechRecognitionActive) {
                this.startSpeechRecognition();
            }
        }, 100);
    }

    stopRecording() {
        if (this.isRecording) {
            this.isRecording = false;
            this.stopVADMonitoring();
            this.updateUI('processing');

            // Stop speech recognition
            if (this.recognition && this.speechRecognitionActive) {
                this.recognition.stop();
            }

            // Clear restart timer
            if (this.restartTimer) {
                clearTimeout(this.restartTimer);
                this.restartTimer = null;
            }

            // Stop microphone stream
            if (this.microphone && this.microphone.mediaStream) {
                this.microphone.mediaStream.getTracks().forEach(track => track.stop());
            }

            if (this.audioContext) {
                this.audioContext.close();
            }

            // Process final results
            this.processTranscription();
        }
    }

    async processTranscription() {
        const finalText = this.finalTranscript.trim();
        
        if (finalText) {
            this.showTranscription(finalText, true);
            this.status.textContent = 'Processing order...';
            
            try {
                const user = this.getCurrentUser();
                if (user) {
                    await window.processVoiceOrder(user.uid, finalText);
                    this.status.textContent = 'Order updated successfully!';
                } else {
                    this.status.textContent = 'Please login to process orders';
                }
            } catch (error) {
                this.status.textContent = 'Error processing order';
                console.error('Order processing error:', error);
            }
        } else {
            this.showTranscription('(No speech detected)', true);
            this.status.textContent = 'No speech detected';
        }

        setTimeout(() => this.updateUI('idle'), 2000);
    }

    getCurrentUser() {
        const auth = firebase.auth();
        return auth.currentUser;
    }

    startIntelligentVAD() {
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Float32Array(bufferLength);

        this.volumeCheckInterval = setInterval(() => {
            this.analyser.getFloatFrequencyData(dataArray);

            // Calculate spectral energy
            const energy = this.calculateSpectralEnergy(dataArray);

            // Update energy buffer for adaptive threshold
            this.energyBuffer.push(energy);
            if (this.energyBuffer.length > this.bufferSize) {
                this.energyBuffer.shift();
            }

            // Calculate baseline energy (average of buffer)
            this.baselineEnergy = this.energyBuffer.reduce((a, b) => a + b, 0) / this.energyBuffer.length;

            // Adaptive threshold based on recent energy levels
            const energyVariance = this.calculateVariance(this.energyBuffer);
            this.adaptiveThreshold = Math.max(
                parseFloat(this.energyThreshold.value),
                this.baselineEnergy + Math.sqrt(energyVariance) * 2
            );

            // Update volume bar with normalized energy
            const volumePercent = Math.min(100, (energy / this.adaptiveThreshold) * 50);
            this.volumeBar.style.width = volumePercent + '%';

            // Voice activity detection
            const currentTime = Date.now();
            const wasSpeaking = this.isSpeaking;
            this.isSpeaking = energy > this.adaptiveThreshold;

            // Update VAD indicator
            if (this.isSpeaking) {
                this.vadLight.classList.add('active');
                this.vadStatus.textContent = 'Voice Detected';
            } else {
                this.vadLight.classList.remove('active');
                this.vadStatus.textContent = 'Listening...';
            }

            // Speech start detection
            if (this.isSpeaking && !wasSpeaking) {
                this.speechStartTime = currentTime;
                this.lastSpeechTime = currentTime;
                this.status.textContent = 'Speech detected - transcribing...';

                // Clear any existing silence timer
                if (this.silenceTimer) {
                    clearTimeout(this.silenceTimer);
                    this.silenceTimer = null;
                }
            }

            // Update last speech time
            if (this.isSpeaking) {
                this.lastSpeechTime = currentTime;
            }

            // Speech end detection with auto-stop
            if (wasSpeaking && !this.isSpeaking && this.speechStartTime) {
                const speechDuration = this.lastSpeechTime - this.speechStartTime;
                const minDuration = parseInt(this.minSpeechDuration.value);

                if (speechDuration >= minDuration) {
                    this.speechStarted = true;
                    this.status.textContent = 'Speech ended - waiting for silence...';

                    // Start silence timer for auto-stop
                    const silenceDuration = parseInt(this.silenceDuration.value);
                    this.silenceTimer = setTimeout(() => {
                        this.status.textContent = 'Silence confirmed - finalizing...';
                        this.stopRecording();
                    }, silenceDuration);
                }
            }

            // Reset if speech resumes during silence period
            if (this.isSpeaking && this.silenceTimer) {
                clearTimeout(this.silenceTimer);
                this.silenceTimer = null;
                this.status.textContent = 'Speech resumed - transcribing...';
            }

        }, 50);
    }

    calculateSpectralEnergy(frequencyData) {
        let energy = 0;
        // Focus on speech frequency range (80Hz - 8kHz)
        const minBin = Math.floor(80 * frequencyData.length / (this.audioContext.sampleRate / 2));
        const maxBin = Math.floor(8000 * frequencyData.length / (this.audioContext.sampleRate / 2));

        for (let i = minBin; i < maxBin; i++) {
            const magnitude = Math.pow(10, frequencyData[i] / 10);
            energy += magnitude;
        }

        return energy / (maxBin - minBin);
    }

    calculateVariance(buffer) {
        if (buffer.length < 2) return 0;

        const mean = buffer.reduce((a, b) => a + b, 0) / buffer.length;
        const variance = buffer.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / buffer.length;
        return variance;
    }

    stopVADMonitoring() {
        if (this.volumeCheckInterval) {
            clearInterval(this.volumeCheckInterval);
            this.volumeCheckInterval = null;
        }

        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
        }

        this.volumeBar.style.width = '0%';
        this.vadLight.classList.remove('active');
        this.vadStatus.textContent = 'Voice Activity Detection Ready';
    }

    showTranscription(text, isFinal = false) {
        this.transcriptionText.textContent = text;
        this.transcription.classList.remove('empty');
        
        // Add visual indication for interim vs final results
        if (isFinal) {
            this.transcriptionText.style.opacity = '1';
            this.transcriptionText.style.fontStyle = 'normal';
        } else {
            this.transcriptionText.style.opacity = '0.7';
            this.transcriptionText.style.fontStyle = 'italic';
        }
    }

    hideTranscription() {
        this.transcription.classList.add('empty');
        this.transcriptionText.textContent = 'Your speech will appear here...';
        this.transcriptionText.style.opacity = '1';
        this.transcriptionText.style.fontStyle = 'normal';
    }

    updateUI(state) {
        this.micButton.className = 'mic-button';

        switch (state) {
            case 'recording':
                this.micButton.classList.add('recording');
                this.micButton.textContent = '⏹️';
                this.status.textContent = 'Listening for speech...';
                break;
            case 'processing':
                this.micButton.classList.add('processing');
                this.micButton.textContent = '⏳';
                this.status.textContent = 'Finalizing transcription...';
                break;
            case 'idle':
            default:
                this.micButton.textContent = '🎤';
                this.status.textContent = 'Click the microphone to start';
                break;
        }
    }

    showError(message) {
        this.error.textContent = message;
        setTimeout(() => this.error.textContent = '', 5000);
    }

    clearError() {
        this.error.textContent = '';
    }
}

// Initialize the app when page loads
document.addEventListener('DOMContentLoaded', () => {
    new VoiceRecorder();
});

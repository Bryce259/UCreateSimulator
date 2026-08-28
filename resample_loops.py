"""Convert the supplied 8 kHz unsigned 8-bit WAV loops to 48 kHz 16-bit PCM.

The source contains no frequencies above 4 kHz, so upsampling cannot invent detail;
this uses a band-limited polyphase resampler to make playback and processing cleaner.
"""
from pathlib import Path
import wave
import numpy as np

def interpolate_6x(samples):
    """Sixfold band-limited interpolation (windowed-sinc reconstruction)."""
    factor = 6
    # Insert zeros then reconstruct with a 20-source-sample Kaiser-windowed sinc.
    expanded = np.zeros(len(samples) * factor, dtype=np.float64)
    expanded[::factor] = samples
    taps = 241
    positions = np.arange(taps) - (taps - 1) / 2
    kernel = np.sinc(positions / factor) * np.kaiser(taps, 8.6) * factor
    kernel /= kernel.sum() / factor
    return np.convolve(expanded, kernel, mode='same')

source = Path('work/U-Create Factory loops - U-load Ready/Wav - 8000Khz -Unsigned 8bit PCM')
target = Path('app/audio')
for wav_path in source.rglob('*.wav'):
    with wave.open(str(wav_path), 'rb') as reader:
        if reader.getnchannels() not in (1, 2) or reader.getframerate() != 8000 or reader.getsampwidth() != 1:
            raise ValueError(f'Unexpected format: {wav_path}')
        channels = reader.getnchannels()
        data = np.frombuffer(reader.readframes(reader.getnframes()), dtype=np.uint8).astype(np.float32).reshape(-1, channels)
    # Center 8-bit PCM, filter/resample at 6x, then create high-headroom 16-bit PCM.
    samples = (data - 128.0) / 128.0
    upsampled = np.column_stack([interpolate_6x(samples[:, channel]) for channel in range(channels)])
    pcm16 = (np.clip(upsampled, -1, 0.9999695) * 32768).astype('<i2')
    out = target / wav_path.relative_to(source)
    out.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(out), 'wb') as writer:
        writer.setnchannels(channels); writer.setsampwidth(2); writer.setframerate(48000)
        writer.writeframes(pcm16.tobytes())
    print(out)

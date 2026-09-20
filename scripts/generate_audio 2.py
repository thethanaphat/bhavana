"""Generate the original bell and background samples shipped with the app.

Requires Python 3 and ffmpeg. Run: python3 scripts/generate_audio.py
"""

from array import array
from math import cos, exp, pi, sin
from pathlib import Path
from random import Random
from subprocess import run
from tempfile import TemporaryDirectory
import wave


RATE = 22050
ROOT = Path(__file__).resolve().parents[1] / "public" / "audio"


def bell(t: float, strike: float, pitch: float) -> float:
    age = t - strike
    if age < 0:
        return 0.0
    attack = min(1.0, age * 110)
    body = (
        0.60 * sin(2 * pi * pitch * age)
        + 0.24 * sin(2 * pi * pitch * 2.01 * age)
        + 0.11 * sin(2 * pi * pitch * 2.97 * age)
        + 0.05 * sin(2 * pi * pitch * 4.12 * age)
    )
    return 0.36 * attack * exp(-age * 1.8) * body


def make_bell(strikes: list[tuple[float, float]], duration: float) -> array:
    samples = array("h")
    for index in range(int(RATE * duration)):
        t = index / RATE
        sample = sum(bell(t, offset, pitch) for offset, pitch in strikes)
        samples.append(int(max(-1.0, min(1.0, sample)) * 32767))
    return samples


def make_rain(duration: float = 48.0) -> array:
    random = Random(20260920)
    samples = [0.0] * int(RATE * duration)
    soft_noise = 0.0
    length = int(RATE * duration)
    fade = int(RATE * 1.2)
    for index in range(length):
        noise = random.uniform(-1.0, 1.0)
        soft_noise = soft_noise * 0.84 + noise * 0.16
        # A quiet wash under individual droplets, rather than dense white noise.
        wash = 0.040 * soft_noise + 0.011 * noise
        edge = min(1.0, index / fade, (length - index - 1) / fade)
        samples[index] = wash * max(0.0, edge)

    for _ in range(int(duration * 9)):
        start = random.randrange(length)
        pitch = random.uniform(950.0, 2550.0)
        strength = random.uniform(0.012, 0.032)
        drop_length = int(RATE * random.uniform(0.018, 0.045))
        for offset in range(min(drop_length, length - start)):
            age = offset / RATE
            samples[start + offset] += strength * exp(-age * 105) * sin(2 * pi * pitch * age)
    return array("h", (int(max(-1.0, min(1.0, sample)) * 32767) for sample in samples))


def make_soft_tones(duration: float = 48.0) -> array:
    samples = [0.0] * int(RATE * duration)
    # Four-chord, slow instrumental phrase. Each plucked note decays to silence;
    # the previous version held three sine tones continuously and sounded like a hum.
    chords = [
        (146.83, [293.66, 369.99, 440.00, 554.37]),  # D major 7
        (123.47, [246.94, 293.66, 369.99, 440.00]),  # B minor 7
        (98.00, [196.00, 246.94, 293.66, 369.99]),   # G major 7
        (110.00, [220.00, 277.18, 329.63, 440.00]),  # A major
    ]

    def note(start: float, frequency: float, volume: float, length: float = 2.6) -> None:
        begin = int(start * RATE)
        for offset in range(min(int(length * RATE), len(samples) - begin)):
            age = offset / RATE
            attack = min(1.0, age * 75)
            decay = exp(-age * 1.45)
            body = (
                0.74 * sin(2 * pi * frequency * age)
                + 0.19 * exp(-age * 1.0) * sin(2 * pi * frequency * 2.01 * age)
                + 0.07 * exp(-age * 2.2) * sin(2 * pi * frequency * 3.02 * age)
            )
            samples[begin + offset] += volume * attack * decay * body

    for bar in range(12):
        bass, tones = chords[bar % 4]
        start = bar * 4.0
        note(start, bass, 0.15, 3.0)
        note(start + 2.0, bass * 1.5, 0.075, 2.0)
        for beat, tone_index in ((0.0, 0), (1.0, 2), (2.0, 1), (3.0, 3)):
            note(start + beat, tones[tone_index], 0.105, 2.1)
        # A separate, sparse upper melody makes the phrase musical rather than a drone.
        note(start + 0.5, tones[(bar + 2) % 4] * 2, 0.032, 1.3)
        note(start + 2.5, tones[(bar + 1) % 4] * 2, 0.026, 1.3)

    fade = int(RATE * 1.3)
    for index in range(fade):
        samples[-fade + index] *= (fade - index) / fade
    return array("h", (int(max(-1.0, min(1.0, sample)) * 32767) for sample in samples))


def make_keepalive(duration: float = 30.0) -> array:
    """A stream that is technically audible but impossible to hear.

    iOS only keeps a locked-screen page's timers running while the page counts as
    audible. Sessions without a background sound therefore lost their bells. A very
    low 40 Hz tone at about -72 dBFS keeps the audio session alive: phone speakers
    cannot reproduce 40 Hz at all, and the level is far below hearing even on
    headphones. Digital silence is avoided because an all-zero stream may be
    discarded rather than treated as playback.
    """
    length = int(RATE * duration)
    samples = array("h")
    for index in range(length):
        t = index / RATE
        # Fade the ends so the loop seam cannot click.
        edge = min(1.0, index / (RATE * 0.5), (length - index - 1) / (RATE * 0.5))
        samples.append(int(8 * edge * sin(2 * pi * 40.0 * t)))
    return samples


def encode(name: str, samples: array, temporary: Path, bitrate: str = "64k") -> None:
    output = ROOT / name
    output.parent.mkdir(parents=True, exist_ok=True)
    wav_path = temporary / f"{output.stem}.wav"
    with wave.open(str(wav_path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(RATE)
        wav_file.writeframes(samples.tobytes())
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav_path), "-c:a", "aac", "-b:a", bitrate, str(output)], check=True)
    print(f"{output.relative_to(ROOT)}: {output.stat().st_size} bytes")


def main() -> None:
    with TemporaryDirectory() as folder:
        temporary = Path(folder)
        # Tell the three bells apart by how many times they strike, not by pitch alone.
        # Through a phone speaker a minor pitch change is easy to miss, but a count is not:
        # two strikes to begin, one along the way, four to close.
        encode("bells/start.m4a", make_bell([(0.0, 523.25), (0.62, 523.25)], 3.0), temporary)
        encode("bells/interval.m4a", make_bell([(0.0, 659.25)], 2.2), temporary)
        encode(
            "bells/end.m4a",
            # Descending G-E-C-C so the close resolves downward and settles on the tonic.
            make_bell([(0.0, 784.0), (0.70, 659.25), (1.40, 523.25), (2.10, 523.25)], 4.8),
            temporary,
        )
        encode("ambience/rain.m4a", make_rain(), temporary)
        encode("ambience/soft-tones.m4a", make_soft_tones(), temporary)
        encode("ambience/keepalive.m4a", make_keepalive(), temporary, bitrate="12k")


if __name__ == "__main__":
    main()

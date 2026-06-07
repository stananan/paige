import { describe, expect, test } from "bun:test";
import { encodePcm16Wav } from "./deepgram-browser";

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

describe("browser microphone encoding", () => {
  test("encodes and downsamples microphone PCM as a valid mono WAV", () => {
    const input = new Float32Array(48_000);
    input[0] = -1;
    input[1] = 1;

    const wav = encodePcm16Wav([input], 48_000);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);

    expect(ascii(wav, 0, 4)).toBe("RIFF");
    expect(ascii(wav, 8, 4)).toBe("WAVE");
    expect(ascii(wav, 36, 4)).toBe("data");
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(32_000);
    expect(wav.byteLength).toBe(32_044);
  });

  test("joins capture chunks without dropping their boundaries", () => {
    const wav = encodePcm16Wav(
      [new Float32Array([0.25, 0.5]), new Float32Array([-0.25, -0.5])],
      16_000,
    );
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);

    expect(view.getUint32(40, true)).toBe(8);
    expect(view.getInt16(44, true)).toBeGreaterThan(0);
    expect(view.getInt16(48, true)).toBeLessThan(0);
  });
});

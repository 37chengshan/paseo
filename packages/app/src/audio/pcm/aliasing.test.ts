import { expect, test } from "vitest";
import { playPcm16 } from "./index";

test("native voice playback suppresses frequencies above the output Nyquist limit", async () => {
  const inputRate = 24000;
  const outputRate = 16000;
  const input = new Uint8Array((inputRate / 10) * 2);
  const view = new DataView(input.buffer);
  for (let index = 0; index < input.length / 2; index++) {
    view.setInt16(
      index * 2,
      Math.round(16000 * Math.sin((2 * Math.PI * 10000 * index) / inputRate)),
      true,
    );
  }
  let rendered: Uint8Array = new Uint8Array();
  await playPcm16(input, "audio/pcm;rate=24000;bits=16", new AbortController().signal, {
    resumePlayback() {},
    playPCMData(bytes) {
      rendered = bytes;
    },
    stopPlayback() {},
  });
  const output = new DataView(rendered.buffer, rendered.byteOffset, rendered.byteLength);
  let real = 0;
  let imaginary = 0;
  const count = rendered.length / 2;
  for (let index = 0; index < count; index++) {
    const sample = output.getInt16(index * 2, true);
    const phase = (2 * Math.PI * 6000 * index) / outputRate;
    real += sample * Math.cos(phase);
    imaginary += sample * Math.sin(phase);
  }
  const aliasAmplitude = (2 * Math.hypot(real, imaginary)) / count;
  // A 10 kHz source tone must not become an audible 6 kHz tone after downsampling.
  expect(aliasAmplitude / 16000).toBeLessThan(0.01);
});

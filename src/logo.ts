// ── Knock the white backdrop out of the supplied logo ──────────────────────
// The source PNG sits on a solid white rectangle, which reads as a white card
// on the dark title screen. Keying every white pixel would punch holes in the
// lettering and the platypus outline, so instead we flood-fill inward from the
// border and only clear white that is *connected to the edge*.

const NEAR_WHITE = 236;

function keyOut(img: HTMLImageElement): string {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);

  const { width: w, height: h } = c;
  const px = g.getImageData(0, 0, w, h);
  const d = px.data;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];

  const isWhite = (i: number) =>
    d[i * 4] >= NEAR_WHITE && d[i * 4 + 1] >= NEAR_WHITE && d[i * 4 + 2] >= NEAR_WHITE;

  const push = (i: number) => {
    if (!seen[i] && isWhite(i)) { seen[i] = 1; stack.push(i); }
  };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }

  while (stack.length) {
    const i = stack.pop()!;
    d[i * 4 + 3] = 0;
    const x = i % w, y = (i / w) | 0;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }

  g.putImageData(px, 0, 0);

  return c.toDataURL();
}

/** Swap every <img> using the logo for a background-free version. */
export function transparentiseLogo() {
  const img = new Image();
  img.onload = () => {
    let url: string;
    try {
      url = keyOut(img);
    } catch {
      return;                       // tainted canvas or similar — keep the original
    }
    document.querySelectorAll<HTMLImageElement>('#menu-logo, #brand').forEach(el => {
      el.src = url;
    });
  };
  img.src = './logo.png';
}

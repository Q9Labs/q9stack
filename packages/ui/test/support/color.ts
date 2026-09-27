export interface Oklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

interface LinearRgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

class OklchParseError extends Error {
  readonly _tag = "OklchParseError";
  readonly input: string;

  constructor(input: string) {
    super(`Not an oklch() colour: ${input}`);
    this.name = "OklchParseError";
    this.input = input;
  }
}

const OKLCH_PATTERN = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*\)$/;

const asFraction = (raw: string): number =>
  raw.endsWith("%") ? Number(raw.slice(0, -1)) / 100 : Number(raw);

export function parseOklch(input: string): Oklch | OklchParseError {
  const match = OKLCH_PATTERN.exec(input.trim());
  if (match === null) {
    return new OklchParseError(input);
  }
  const [, l, c, h] = match;
  if (l === undefined || c === undefined || h === undefined) {
    return new OklchParseError(input);
  }
  return { l: asFraction(l), c: Number(c), h: Number(h) };
}

/** Oklab → linear sRGB, per the Oklab specification (Björn Ottosson, 2020). */
function oklchToLinearRgb({ l, c, h }: Oklch): LinearRgb {
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const bAxis = c * Math.sin(hRad);

  const lPrime = l + 0.3963377774 * a + 0.2158037573 * bAxis;
  const mPrime = l - 0.1055613458 * a - 0.0638541728 * bAxis;
  const sPrime = l - 0.0894841775 * a - 1.291485548 * bAxis;

  const lCone = lPrime ** 3;
  const mCone = mPrime ** 3;
  const sCone = sPrime ** 3;

  return {
    r: 4.0767416621 * lCone - 3.3077115913 * mCone + 0.2309699292 * sCone,
    g: -1.2684380046 * lCone + 2.6097574011 * mCone - 0.3413193965 * sCone,
    b: -0.0041960863 * lCone - 0.7034186147 * mCone + 1.707614701 * sCone,
  };
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** WCAG 2.x relative luminance. Linear sRGB is already gamma-decoded. */
function relativeLuminance(rgb: LinearRgb): number {
  return 0.2126 * clamp01(rgb.r) + 0.7152 * clamp01(rgb.g) + 0.0722 * clamp01(rgb.b);
}

export function contrastRatio(foreground: Oklch, background: Oklch): number {
  const a = relativeLuminance(oklchToLinearRgb(foreground));
  const b = relativeLuminance(oklchToLinearRgb(background));
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

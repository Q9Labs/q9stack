import { renderMitLicense } from "../licenses/mit.js";
import { renderProprietaryLicense } from "../licenses/proprietary.js";

export type LicenseKind = "mit" | "proprietary";

export function renderLicenseBlock(kind: LicenseKind, year: string): string {
  const renderers: {
    readonly mit: (licenseYear: string) => string;
    readonly proprietary: (licenseYear: string) => string;
  } = {
    mit: renderMitLicense,
    proprietary: renderProprietaryLicense,
  };
  return renderers[kind](year);
}

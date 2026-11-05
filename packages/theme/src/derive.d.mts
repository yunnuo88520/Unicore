// Author: yunnuo <ymz@ebox.vip>
// Description: Type surface for the shared accent derivation module.
export declare const accentVariables: readonly string[];
export declare function derivePalette(accent: string, modes: { light: Record<string, string>; dark: Record<string, string> }): { light: Record<string, string>; dark: Record<string, string> };

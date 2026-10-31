// Author: yunnuo <ymz@ebox.vip>
import type { Plugin } from 'vite';
export function readFeatures(env?: NodeJS.ProcessEnv): { features: { license: boolean; updater: boolean }; tags: string };
export function featureBuild(): { define: Record<string, string>; plugin: Plugin };

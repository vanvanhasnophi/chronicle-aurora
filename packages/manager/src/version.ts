// Expose build-time version injected by vite.config.ts
declare const __VERSION__: string
declare const __YEAR__: string
declare const __BUILD_TIME__: string

export const APP_VERSION = __VERSION__
export const APP_YEAR = __YEAR__
/**
 * ISO timestamp of the moment this bundle was built.
 *
 * Purpose: tell WHICH copy of the CMS a window is running. A dev server, a
 * `dist/` served by `vite preview`, an installed Electron build and a deployed
 * build all look identical in the UI — this is the only reliable discriminator.
 */
export const APP_BUILD_TIME = __BUILD_TIME__

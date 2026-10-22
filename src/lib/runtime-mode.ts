/** Public build-time capability flag. No credentials belong in this module. */
export const IS_STANDALONE = process.env.NEXT_PUBLIC_APP_MODE === 'standalone';

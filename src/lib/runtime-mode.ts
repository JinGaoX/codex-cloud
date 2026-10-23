/** Public build-time capability flag. No credentials belong in this module. */
export const IS_NATIVE = process.env.NEXT_PUBLIC_APP_MODE === 'native';
export const IS_STANDALONE = process.env.NEXT_PUBLIC_APP_MODE === 'standalone' || IS_NATIVE;

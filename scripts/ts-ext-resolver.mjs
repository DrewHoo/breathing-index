// Module-resolution hook for scripts that import the app's TypeScript straight
// into plain Node (type stripping handles the syntax; this handles the paths).
// The app's imports are extensionless because Vite resolves them; Node wants
// the `.ts` spelled out, so retry exactly that on a miss and nothing more.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context)
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.')) {
      return nextResolve(`${specifier}.ts`, context)
    }
    throw error
  }
}

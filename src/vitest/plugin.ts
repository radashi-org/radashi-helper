export function vitestRadashi() {
  return {
    name: 'vitest-radashi',
    async config(config: { esbuild?: any }) {
      if (config.esbuild === false) return
      const { esbuildRadashi } = await import('../esbuild/plugin')
      config.esbuild ||= {}
      config.esbuild.plugins ||= []
      config.esbuild.plugins.push(esbuildRadashi())
    },
  }
}

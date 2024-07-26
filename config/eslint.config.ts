import typescript from '@typescript-eslint/parser'
import compat from 'eslint-plugin-compat'

export default {
  ...compat.configs['flat/recommended'],
  files: ['**/*.ts'],
  ignores: [
    '**/node_modules/**',
    '**/dist/**',
    '**/coverage/**',
    '**/.radashi/**',
  ],
  languageOptions: {
    parser: typescript,
    parserOptions: {
      ecmaVersion: 'latest',
    },
  },
}

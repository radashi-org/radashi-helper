import compat from 'eslint-plugin-compat'
import typescript from '@typescript-eslint/parser'

export default {
  ...compat.configs['flat/recommended'],
  files: ['**/*.ts'],
  ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**'],
  languageOptions: {
    parser: typescript,
    parserOptions: {
      ecmaVersion: 'latest',
    },
  },
}

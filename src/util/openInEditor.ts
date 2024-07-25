import { execa } from 'execa'
import { proxied } from 'radashi'
import { Env } from '../env'
import { updateRadashiConfig } from './updateRadashiConfig'

let forcedEditor: string | undefined

export async function openInEditor(file: string, env: Env) {
  let editor = forcedEditor || env.config.editor

  if (editor?.[0] === '!') {
    editor = editor.slice(1)
  } else if (!forcedEditor) {
    const { default: prompts } = await import('prompts')

    // Map program names to human-readable names.
    const displayNames = proxied(cmd => {
      switch (cmd) {
        case 'code':
          return 'VS Code'
        case 'code-insiders':
          return 'VS Code Insiders'
        case 'cursor':
          return 'Cursor'
        case 'vim':
          return 'Vim'
        case 'emacs':
          return 'Emacs'
        case 'sublime':
          return 'Sublime Text'
        case 'atom':
          return 'Atom'
      }
      return cmd
    })

    const editorOptions = []

    if (env.config.editor) {
      editorOptions.push({
        title: `Open with ${displayNames[env.config.editor]}`,
        value: env.config.editor,
      })
      editorOptions.push({
        title: `Always open with ${displayNames[env.config.editor]}`,
        value: '!' + env.config.editor,
      })
    } else {
      if (process.env.EDITOR) {
        editorOptions.push({
          title: `Open with $EDITOR (${process.env.EDITOR})`,
          value: '$EDITOR',
        })
      }

      for (const editor of [
        'code',
        'code-insiders',
        'cursor',
        'vim',
        'emacs',
        'sublime',
        'atom',
      ]) {
        try {
          await execa('command', ['-v', editor])
          editorOptions.push({
            title: `Open with ${displayNames[editor]}`,
            value: editor,
          })
        } catch {
          // Editor not found, skip
        }
      }

      editorOptions.push({
        title: 'Open with custom command',
        value: 'custom',
      })
    }

    const { response }: { response: string } = await prompts({
      type: 'autocomplete',
      name: 'response',
      message: 'How would you like to open the file?',
      choices: editorOptions,
    })

    if (response === 'custom') {
      const { customCommand } = await prompts({
        type: 'text',
        name: 'customCommand',
        message: 'Enter the command to open the file:',
      })
      if (!customCommand) {
        console.log('No command provided. Exiting.')
        return
      }
      editor = customCommand
    } else if (response[0] === '!') {
      editor = response.slice(1)
    } else if (response === '$EDITOR') {
      editor = process.env.EDITOR!
    } else {
      editor = response
    }

    forcedEditor = editor
    await updateRadashiConfig(env, {
      editor: response === 'custom' ? editor : response,
    })
  }

  if (editor) {
    try {
      await execa(editor, [file])
    } catch (error) {
      console.error(`Failed to open file with ${editor}:`, error)
    }
  }
}

if (typeof require === 'function') {
  require('../dist/cli.js').run(process.argv)
} else {
  import('../dist/cli.js').then(cli => cli.run(process.argv))
}

require('esbuild').buildSync({
  entryPoints: ['src/test/extract.test.ts'],
  bundle: true,
  outfile: 'dist-test/extract.test.js',
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  logLevel: 'info',
})

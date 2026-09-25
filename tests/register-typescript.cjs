const fs = require('node:fs');
const ts = require('typescript');

// Compile the actual app modules for Node's test runner. Type safety is checked
// separately by npm run typecheck; no application logic is copied into the tests.
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    });
    module._compile(result.outputText, filename);
  };
}

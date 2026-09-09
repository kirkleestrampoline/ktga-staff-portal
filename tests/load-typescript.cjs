// Node's built-in test runner plus the project's existing TypeScript compiler.
// Compile only in memory; dependency overrides keep route tests off real services.
const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
module.exports = function loader(overrides = {}) {
  const cache = new Map();
  function load(filename) {
    filename = path.resolve(filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
      fileName: filename,
    }).outputText;
    const localRequire = name => {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      if (!name.startsWith('.') && !name.startsWith('@/')) return require(name);
      let resolved = name.startsWith('@/') ? path.resolve(name.slice(2)) : path.resolve(path.dirname(filename), name);
      if (!path.extname(resolved)) resolved += fs.existsSync(resolved + '.ts') ? '.ts' : '.tsx';
      return load(resolved);
    };
    new Function('require', 'module', 'exports', source)(localRequire, module, module.exports);
    return module.exports;
  }
  return load;
};

// Emula el runtime de n8n (los code nodes reciben $input / $(nodo)) para probar
// los normalizadores + prep + parse fuera de n8n.
const fs = require('fs');
const vm = require('vm');

function runCode(file, inputItems, nodeOutputs = {}) {
  const src = fs.readFileSync(`${__dirname}/../workflows/nodes/${file}`, 'utf8');
  const items = inputItems.map(j => ({ json: j }));
  const $input = {
    all: () => items,
    first: () => items[0],
  };
  const $ = name => {
    const outs = (nodeOutputs[name] || []).map(j => ({ json: j }));
    return { all: () => outs, first: () => outs[0] };
  };
  const ctx = vm.createContext({ $input, $, console, JSON, Date, Number, Math, Array, String, Set, Map, Object, Error });
  return vm.runInContext(`(function(){${src}})()`, ctx).map(i => i.json);
}
module.exports = { runCode };

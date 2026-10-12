// Check the exported document and its real script load order without a GPU/browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8');
assert(!/<script\b[^>]*\bsrc=/i.test(html), 'Export must include every script');
assert(!/<link\b[^>]*\brel="stylesheet"/i.test(html), 'Export must include every stylesheet');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
const ctx = vm.createContext({ console, navigator: { maxTouchPoints: 5 }, performance, setTimeout, clearTimeout });
ctx.window = ctx;
ctx.self = ctx;
for (let i = 0; i < scripts.length; i++) {
  const script = new vm.Script(scripts[i], { filename: `export-script-${i}.js` });
  // The final script starts WebGL and DOM UI; those require a real browser.
  if (i !== scripts.length - 1) script.runInContext(ctx);
}
assert.equal(vm.runInContext('THREE.REVISION', ctx), '147');
assert.equal(vm.runInContext('typeof THREE.GLTFLoader', ctx), 'function');
assert.equal(vm.runInContext('HoopRoster.CHARACTERS.length', ctx), 4);
assert.equal(vm.runInContext('HoopGame.DEFAULT_SETTINGS.quality', ctx), 'low');
assert.equal(vm.runInContext('typeof window.HOOP.shoot', ctx), 'function');
assert.equal(vm.runInContext('typeof HoopWorld.build', ctx), 'function');
console.log(`PASS exported document: ${scripts.length} scripts compile and modules load in order; four characters, phone defaults and shooting API present`);

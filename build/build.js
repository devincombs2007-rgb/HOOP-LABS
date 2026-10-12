// Builds dist/hoop-lab.html: one self-contained file. Reads the script/style order from index.html
// (the single source of truth), inlines every local file, and points Three.js r147 at jsDelivr.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const CDN = {
  'node_modules/three/build/three.min.js': 'https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js',
  'node_modules/three/examples/js/loaders/GLTFLoader.js': 'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/GLTFLoader.js',
};
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (!fs.existsSync(path.join(root, 'src', 'assets.gen.js'))) require('./make_assets.js');
html = html.replace(/<link rel="stylesheet" href="(src\/[^"]+)">/g, (m, f) => `<style>\n${fs.readFileSync(path.join(root, f), 'utf8')}\n</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, f) => {
  if (CDN[f]) return `<script src="${CDN[f]}"></script>`;
  const code = fs.readFileSync(path.join(root, f), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script>/* ${f} */\n${code}\n</script>`;
});
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'hoop-lab.html'), html);
console.log('dist/hoop-lab.html', (html.length / 1024).toFixed(0), 'KB');

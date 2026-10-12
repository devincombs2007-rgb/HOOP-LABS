// Builds dist/hoop-lab.html: one self-contained file. Reads the script/style order from index.html
// (the single source of truth), including Three.js so gameplay needs no CDN requests.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
// System font fallbacks also let the exported file work completely offline.
html = html.replace(/<link[^>]+href="https:\/\/fonts\.googleapis\.com[^>]*>\s*/g, '');
if (!fs.existsSync(path.join(root, 'src', 'assets.gen.js'))) require('./make_assets.js');
html = html.replace(/<link rel="stylesheet" href="(src\/[^"]+)">/g, (m, f) => `<style>\n${fs.readFileSync(path.join(root, f), 'utf8')}\n</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, f) => {
  const code = fs.readFileSync(path.join(root, f), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script>/* ${f} */\n${code}\n</script>`;
});
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'hoop-lab.html'), html);
fs.writeFileSync(path.join(root, 'dist', 'index.html'), html);
console.log('dist/hoop-lab.html', (html.length / 1024).toFixed(0), 'KB');

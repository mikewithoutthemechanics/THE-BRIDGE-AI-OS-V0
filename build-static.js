// Build script for Vercel: copies static assets into public/ for CDN serving
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'public');

function mkdirp(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  mkdirp(path.dirname(dest));
  fs.copyFileSync(src, dest);
  console.log(`  ${path.relative(ROOT, src)} -> ${path.relative(ROOT, dest)}`);
}

function copyDir(srcDir, destDir, extensions) {
  if (!fs.existsSync(srcDir)) return;
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, extensions);
    } else if (!extensions || extensions.some(ext => entry.name.endsWith(ext))) {
      copyFile(srcPath, destPath);
    }
  }
}

console.log('Building static assets into public/...');
mkdirp(OUT);

// Copy root-level HTML/CSS/JS static files
const staticExts = ['.html', '.css', '.ico', '.png', '.jpg', '.svg', '.gif', '.webp', '.woff', '.woff2', '.ttf'];
const rootFiles = fs.readdirSync(ROOT);
for (const file of rootFiles) {
  const fullPath = path.join(ROOT, file);
  if (fs.statSync(fullPath).isFile() && staticExts.some(ext => file.endsWith(ext))) {
    copyFile(fullPath, path.join(OUT, file));
  }
}

// Copy Xpublic/ HTML files to public/ ROOT so /topology.html etc. work on Vercel
// (Non-HTML assets still go to public/Xpublic/ to avoid collisions)
const xpubDir = path.join(ROOT, 'Xpublic');
if (fs.existsSync(xpubDir)) {
  const xpubFiles = fs.readdirSync(xpubDir, { withFileTypes: true });
  for (const entry of xpubFiles) {
    const srcPath = path.join(xpubDir, entry.name);
    if (entry.isFile() && entry.name.endsWith('.html')) {
      // HTML pages go to public/ root for clean URLs
      copyFile(srcPath, path.join(OUT, entry.name));
    } else if (entry.isFile()) {
      copyFile(srcPath, path.join(OUT, 'Xpublic', entry.name));
    } else if (entry.isDirectory()) {
      copyDir(srcPath, path.join(OUT, 'Xpublic', entry.name));
    }
  }
}

// Copy Xscripts/ (if referenced by HTML)
copyDir(path.join(ROOT, 'Xscripts'), path.join(OUT, 'Xscripts'));

// Copy any other public-facing asset directories
for (const dir of ['Xlogs', 'migrations']) {
  const src = path.join(ROOT, dir);
  if (fs.existsSync(src) && fs.statSync(src).isDirectory()) {
    copyDir(src, path.join(OUT, dir), ['.html', '.css', '.js', '.json', '.svg', '.png']);
  }
}

// Create index.html redirect to ui.html if not present
if (!fs.existsSync(path.join(OUT, 'index.html'))) {
  fs.writeFileSync(path.join(OUT, 'index.html'), `<!DOCTYPE html><meta http-equiv="refresh" content="0;url=/ui.html"><a href="/ui.html">Bridge AI OS</a>`);
  console.log('  Created index.html -> ui.html redirect');
}

console.log('Done!');

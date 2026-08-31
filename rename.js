import fs from 'fs';
import path from 'path';

function replaceInDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      replaceInDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('/lib/firebase')) {
        content = content.replace(/\/lib\/firebase/g, '/lib/p2p');
        fs.writeFileSync(fullPath, content);
      }
    }
  }
}

replaceInDir('./src');

// Folds the PeerJS CDN bundle and level.json into index.html so the game runs
// as one file with no network requests. Safe to re-run: both regions are
// delimited by sentinels and are rebuilt from level.json each time.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(root, 'index.html');
const peerPath = path.join(root, 'vendor', 'peerjs.min.js');
const levelPath = path.join(root, 'level.json');

const PEER_START = '<!-- peerjs:start -->';
const PEER_END = '<!-- peerjs:end -->';
const LEVEL_START = '<!-- level:start -->';
const LEVEL_END = '<!-- level:end -->';

// '<' is the only character that can terminate the inline script early, and
// JSON.stringify does not escape it.
const embedLevel = (level) =>
  JSON.stringify(level, null, 2).replace(/</g, '\\u003c');

function replaceBetween(html, start, end, replacement) {
  const from = html.indexOf(start);
  const to = html.indexOf(end);
  if (from === -1 || to === -1 || to < from) {
    throw new Error(`Missing sentinel pair: ${start} ... ${end}`);
  }
  return html.slice(0, from) + start + replacement + end + html.slice(to + end.length);
}

const peer = fs.readFileSync(peerPath, 'utf8').replace(/\/\/# sourceMappingURL=.*$/m, '').trim();
if (/<\/script/i.test(peer)) throw new Error('peerjs bundle contains a closing script tag');

const level = JSON.parse(fs.readFileSync(levelPath, 'utf8'));
if (!Array.isArray(level)) throw new Error('level.json must contain an array of rectangles');

let html = fs.readFileSync(htmlPath, 'utf8');

// The start sentinel keeps the leading indent already in the file; the end
// sentinel gets none, so both insertion paths below emit byte-identical output.
const peerBlock = `\n  <script>\n${peer}\n  </script>\n`;
const levelBlock = `\n  <script id="embedded-level" type="application/json">\n${embedLevel(level)}\n  </script>\n`;

if (html.includes(PEER_START)) {
  html = replaceBetween(html, PEER_START, PEER_END, peerBlock);
} else {
  const tag = /[ \t]*<!--[ \t]*PeerJS Library CDN[ \t]*-->\n[ \t]*<script src="https:\/\/unpkg\.com\/peerjs[^"]*"><\/script>/;
  if (!tag.test(html)) throw new Error('PeerJS CDN script tag not found in index.html');
  html = html.replace(tag, `${PEER_START}${peerBlock}${PEER_END}`);
}

if (html.includes(LEVEL_START)) {
  html = replaceBetween(html, LEVEL_START, LEVEL_END, levelBlock);
} else {
  const marker = '  <canvas id="gameCanvas"></canvas>';
  if (!html.includes(marker)) throw new Error('gameCanvas marker not found in index.html');
  html = html.replace(marker, `  ${LEVEL_START}${levelBlock}${LEVEL_END}\n\n${marker}`);
}

fs.writeFileSync(htmlPath, html);
console.log(`Embedded peerjs (${peer.length} bytes) and level.json (${level.length} rects) into index.html`);

#!/usr/bin/env node
/* Atualiza __APP_BUILD__, query string do swRegistration.js e CACHE_VERSION do sw.js. */

const fs = require('fs');
const {
  HTML_FILES,
  SERVICE_WORKER_FILE,
  resolveRootPath
} = require('./release-config');

const cliArgs = process.argv.slice(2);
const dryRun = cliArgs.includes('--dry-run');
const buildArg = cliArgs.find(arg => !arg.startsWith('--'));
const nextBuild = buildArg || new Date().toISOString().replace(/[TZ]/g, '.').replace(/[:]/g, '-').slice(0, 19);

const buildPattern = /window\.__APP_BUILD__\s*=\s*'[^']+';/g;
const swPattern = /js\/swRegistration\.js\?v=[^"']+/g;
const swCacheVersionPattern = /const CACHE_VERSION = '[^']+';/g;

let updatedCount = 0;

for (const relativeFile of HTML_FILES) {
  const filePath = resolveRootPath(relativeFile);
  if (!fs.existsSync(filePath)) {
    console.warn(`[bump-app-build] Arquivo nao encontrado: ${relativeFile}`);
    continue;
  }

  const original = fs.readFileSync(filePath, 'utf8');
  const updated = original
    .replace(buildPattern, `window.__APP_BUILD__ = '${nextBuild}';`)
    .replace(swPattern, `js/swRegistration.js?v=${nextBuild}`);

  if (updated !== original) {
    updatedCount += 1;
    if (!dryRun) {
      fs.writeFileSync(filePath, updated, 'utf8');
    }
  }
}

const swFilePath = resolveRootPath(SERVICE_WORKER_FILE);
if (!fs.existsSync(swFilePath)) {
  console.warn(`[bump-app-build] Service Worker nao encontrado: ${SERVICE_WORKER_FILE}`);
} else {
  const originalSw = fs.readFileSync(swFilePath, 'utf8');
  const updatedSw = originalSw.replace(swCacheVersionPattern, `const CACHE_VERSION = '${nextBuild}';`);

  if (updatedSw !== originalSw) {
    updatedCount += 1;
    if (!dryRun) {
      fs.writeFileSync(swFilePath, updatedSw, 'utf8');
    }
  }
}

const modeLabel = dryRun ? 'DRY-RUN' : 'APLICADO';
console.log(`[bump-app-build] ${modeLabel} | build=${nextBuild} | arquivos_atualizados=${updatedCount}`);

if (updatedCount === 0) {
  console.log('[bump-app-build] Nenhuma alteracao necessaria.');
}

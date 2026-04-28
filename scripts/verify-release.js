#!/usr/bin/env node

const fs = require('fs');
const {
  HTML_FILES,
  SERVICE_WORKER_FILE,
  resolveRootPath
} = require('./release-config');

const buildPattern = /window\.__APP_BUILD__\s*=\s*'([^']+)';/;
const swRegistrationPattern = /js\/swRegistration\.js\?v=([^"']+)/;
const swCacheVersionPattern = /const CACHE_VERSION = '([^']+)';/;

function fail(message) {
  console.error(`[release:verify] ERRO: ${message}`);
  process.exitCode = 1;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function validateHtmlBuildConsistency() {
  const builds = new Map();

  HTML_FILES.forEach((relativeFile) => {
    const filePath = resolveRootPath(relativeFile);
    if (!fs.existsSync(filePath)) {
      fail(`Arquivo HTML ausente: ${relativeFile}`);
      return;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const buildMatch = content.match(buildPattern);
    const swMatch = content.match(swRegistrationPattern);

    if (!buildMatch) {
      fail(`__APP_BUILD__ ausente em ${relativeFile}`);
      return;
    }

    if (!swMatch) {
      fail(`swRegistration versionado ausente em ${relativeFile}`);
      return;
    }

    const buildValue = buildMatch[1];
    const swValue = swMatch[1];
    if (buildValue !== swValue) {
      fail(`Versao divergente entre __APP_BUILD__ (${buildValue}) e swRegistration (${swValue}) em ${relativeFile}`);
      return;
    }

    if (!builds.has(buildValue)) {
      builds.set(buildValue, []);
    }
    builds.get(buildValue).push(relativeFile);
  });

  if (builds.size > 1) {
    const details = Array.from(builds.entries())
      .map(([build, files]) => `${build}: ${files.join(', ')}`)
      .join(' | ');
    fail(`HTMLs usam builds diferentes: ${details}`);
    return null;
  }

  return builds.size === 1 ? Array.from(builds.keys())[0] : null;
}

function validateServiceWorker(buildValue) {
  const swPath = resolveRootPath(SERVICE_WORKER_FILE);
  if (!fs.existsSync(swPath)) {
    fail(`Service Worker ausente: ${SERVICE_WORKER_FILE}`);
    return;
  }

  const content = fs.readFileSync(swPath, 'utf8');
  const swCacheMatch = content.match(swCacheVersionPattern);
  if (!swCacheMatch) {
    fail('CACHE_VERSION ausente em sw.js');
    return;
  }

  if (buildValue && swCacheMatch[1] !== buildValue) {
    fail(`CACHE_VERSION (${swCacheMatch[1]}) difere do build atual (${buildValue})`);
  }
}

function validateFirebaseHeaders() {
  const firebaseJsonPath = resolveRootPath('firebase.json');
  if (!fs.existsSync(firebaseJsonPath)) {
    fail('firebase.json ausente');
    return;
  }

  const firebaseJson = readJson(firebaseJsonPath);
  const headers = Array.isArray(firebaseJson?.hosting?.headers) ? firebaseJson.hosting.headers : [];

  const expectedHeaders = new Map([
    ['/sw.js', 'no-cache, no-store, must-revalidate'],
    ['**/*.html', 'no-cache, no-store, must-revalidate'],
    ['**/*.js', 'no-cache, must-revalidate'],
    ['**/*.css', 'no-cache, must-revalidate']
  ]);

  expectedHeaders.forEach((expectedValue, source) => {
    const entry = headers.find((item) => item?.source === source);
    if (!entry) {
      fail(`Header de release ausente em firebase.json para ${source}`);
      return;
    }

    const cacheControl = Array.isArray(entry.headers)
      ? entry.headers.find((item) => item?.key === 'Cache-Control')
      : null;

    if (!cacheControl) {
      fail(`Cache-Control ausente em firebase.json para ${source}`);
      return;
    }

    if (cacheControl.value !== expectedValue) {
      fail(`Cache-Control inesperado para ${source}: ${cacheControl.value}`);
    }
  });
}

function main() {
  const buildValue = validateHtmlBuildConsistency();
  validateServiceWorker(buildValue);
  validateFirebaseHeaders();

  if (process.exitCode && process.exitCode !== 0) {
    return;
  }

  console.log(`[release:verify] OK | build=${buildValue || 'indefinido'} | htmls=${HTML_FILES.length}`);
}

main();

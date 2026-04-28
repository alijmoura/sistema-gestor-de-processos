#!/usr/bin/env node

const path = require('path');

const ROOT_DIR = process.cwd();
const HTML_FILES = [
  'agenda.html',
  'aprovacao.html',
  'arquivados.html',
  'configuracoes.html',
  'dashboard.html',
  'ferramentas.html',
  'login.html',
  'processos.html',
  'profile.html',
  'relatorios.html',
  'call.html',
  'scheduling-portal.html',
  'aprovacao-solicitacao.html',
  'whatsapp.html',
  'whatsapp-dashboard.html',
  'whatsapp-workflows.html'
];
const SERVICE_WORKER_FILE = 'sw.js';
const FIREBASE_RC_FILE = '.firebaserc';

function resolveRootPath(...segments) {
  return path.join(ROOT_DIR, ...segments);
}

module.exports = {
  ROOT_DIR,
  HTML_FILES,
  SERVICE_WORKER_FILE,
  FIREBASE_RC_FILE,
  resolveRootPath
};

#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function parseArgs(argv = []) {
  const parsed = {
    mode: 'prepare',
    target: 'full',
    build: null,
    dryRun: false,
    rebuildAprovacoes: false,
    skipCss: false,
    skipLint: false,
    skipBump: false,
    skipVerify: false
  };

  argv.forEach((arg) => {
    if (arg === 'prepare' || arg === 'deploy') {
      parsed.mode = arg;
      return;
    }
    if (arg.startsWith('--target=')) {
      parsed.target = arg.split('=')[1];
      return;
    }
    if (arg.startsWith('--build=')) {
      parsed.build = arg.split('=')[1];
      return;
    }
    if (arg === '--dry-run') parsed.dryRun = true;
    if (arg === '--rebuild-aprovacoes') parsed.rebuildAprovacoes = true;
    if (arg === '--skip-css') parsed.skipCss = true;
    if (arg === '--skip-lint') parsed.skipLint = true;
    if (arg === '--skip-bump') parsed.skipBump = true;
    if (arg === '--skip-verify') parsed.skipVerify = true;
  });

  return parsed;
}

function resolveCommand(command, args = []) {
  if (command === 'firebase') {
    const localFirebaseBinary = path.join(
      process.cwd(),
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'firebase.cmd' : 'firebase'
    );

    if (fs.existsSync(localFirebaseBinary)) {
      return {
        command: localFirebaseBinary,
        args
      };
    }

    return {
      command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
      args: ['-y', 'firebase-tools@latest', ...args]
    };
  }

  if (process.platform === 'win32') {
    if (command === 'npm') {
      return { command: 'npm.cmd', args };
    }
  }

  return { command, args };
}

function runStep(label, command, args, { dryRun = false } = {}) {
  const printable = [command, ...args].join(' ');
  console.log(`[release] ${label}: ${printable}`);

  if (dryRun) {
    return;
  }

  const resolved = resolveCommand(command, args);
  const result = spawnSync(resolved.command, resolved.args, {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function deployTarget(target, dryRun) {
  if (target === 'hosting') {
    runStep('deploy-hosting', 'firebase', ['deploy', '--only', 'hosting'], { dryRun });
    return;
  }

  if (target === 'backend') {
    runStep('deploy-backend', 'firebase', ['deploy', '--only', 'firestore,functions'], { dryRun });
    return;
  }

  runStep('deploy-backend', 'firebase', ['deploy', '--only', 'firestore,functions'], { dryRun });
  runStep('deploy-hosting', 'firebase', ['deploy', '--only', 'hosting'], { dryRun });
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.skipCss) {
    runStep('build-css', 'npm', ['run', 'build:css'], args);
  }

  if (!args.skipLint) {
    runStep('lint', 'npm', ['run', 'lint'], args);
  }

  if (!args.skipBump) {
    const bumpArgs = ['scripts/bump-app-build.js'];
    if (args.build) bumpArgs.push(args.build);
    if (args.dryRun) bumpArgs.push('--dry-run');
    runStep('bump-build', 'node', bumpArgs, args);
  }

  if (!args.skipVerify) {
    runStep('verify-release', 'node', ['scripts/verify-release.js'], args);
  }

  if (args.mode === 'deploy') {
    deployTarget(args.target, args.dryRun);

    if (args.rebuildAprovacoes && args.target !== 'hosting') {
      runStep('rebuild-aprovacoes', 'node', ['scripts/rebuild-aprovacao-aggregates.js'], args);
    }
  }

  console.log(`[release] concluido | mode=${args.mode} | target=${args.target} | dryRun=${args.dryRun}`);
}

main();

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function getConfigPath() {
  return path.join(app.getPath('userData'), 'studio-config.json');
}

function getWindowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function readConfig() {
  try {
    const data = fs.readFileSync(getConfigPath(), 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return null;
  }
}

function writeConfig(config) {
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
}

function configExists() {
  return fs.existsSync(getConfigPath());
}

function readWindowState() {
  try {
    const data = fs.readFileSync(getWindowStatePath(), 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return null;
  }
}

function writeWindowState(bounds) {
  try {
    fs.writeFileSync(getWindowStatePath(), JSON.stringify(bounds, null, 2), 'utf-8');
  } catch (e) {
    // Silently ignore write errors
  }
}

module.exports = { readConfig, writeConfig, configExists, readWindowState, writeWindowState };

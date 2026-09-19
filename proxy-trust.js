// Render puts the app behind a reverse proxy. Configure Express before server.js
// creates its rate limiter, without exposing this infrastructure detail in the app code.
const express = require('express');
const originalDefaultConfiguration = express.application.defaultConfiguration;
express.application.defaultConfiguration = function defaultConfigurationWithProxyTrust() {
  originalDefaultConfiguration.call(this);
  this.set('trust proxy', 1);
};

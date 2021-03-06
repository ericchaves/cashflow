'use strict';

const axios = require('axios');
const config = require('../../../config.js');
const _ = require('lodash');

const BASE_URL = config.endpoint;

const path = (paths) => {
  if (_.isArray(paths)) {
    if (!_.every(paths)) {
      throw new Error(`Invalid path elements [${paths}]. All elements must be defined`);
    }
    return BASE_URL.concat(paths.join('/'));
  } else {
    return BASE_URL.concat(paths);
  }
};

const getToken = () => ('"' + localStorage.getItem('cashflow_token') + '"');

const getConfig = (isJSON) => {
  return {
    headers: {
      'Authorization': 'Token token=' + getToken()
    }
  };
};

const getJSONConfig = () => {
  return {
    headers: {
      'Authorization': 'Token token=' + getToken(),
      'Content-Type': 'application/json'
    }
  };
};

module.exports = {

  login: {

    login: (loginFormData) => axios.post(path('login'), loginFormData, getJSONConfig())

  },

  cff: {

    getMain: () => axios.get(path(['cffs', 'main']), getConfig()),

    getBank: () => axios.get(path(['cffs', 'bank']), getConfig()),

    getManual: () => axios.get(path(['cffs', 'manual']), getConfig()),

    pullMain: () => axios.post(path(['cffs', 'main', 'pull']), {}, getConfig()),

    pullBank: () => axios.post(path(['cffs', 'bank', 'pull']), {}, getConfig()),

    createManualLine: (line) => axios.post(path(['cffs', 'manual']), line, getJSONConfig()),
    
    saveManualLine: (lineId, line) => axios.post(path(['cffs', 'manual', lineId]), line, getJSONConfig()),

    deleteManualLine: (lineId) => axios.delete(path(['cffs', 'manual', lineId]), getConfig()),

  },

  progress: {

    getMain: () => axios.get(path(['cffs', 'main', 'pull', 'progress']), getConfig()),

    resetMain: () => axios.post(path(['cffs', 'main', 'pull', 'progress', 'clear']), {}, getConfig()),

  },

  matches: {

    getAll: () => axios.get(path('matches'), getConfig()),

    commit: () => axios.post(path(['matches', 'stage', 'commit']), {}, getConfig()),

    stageMatch: (match) => axios.put(path(['matches', 'stage', 'mainPaymentId', match.main ? match.main.id : '_empty_', 'dataPaymentId', match.data.id]), {}, getConfig()),

    stageEmptyMatch: (match) => axios.put(path(['matches', 'stage', 'dataPaymentId', match.data.id]), {}, getConfig()),

    unstageMatch: (match) => axios.delete(path(['matches', 'stage', match.id]), getConfig()),

    deleteMatch: (match) => axios.delete(path(['matches', match.id]), getConfig()),

  },

  user: {

    getCurrentUser: () => axios.get(path(['users', 'me']), getConfig())

  }

};

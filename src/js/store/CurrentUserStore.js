'use strict';

const _ = require('lodash');
const C = require('../constants/AppConstants').ActionTypes;
const DataStore = require('./DataStore');
const Store = require('./Store');
const WebAPIUtils = require('../utils/WebAPIUtils.js');

let loginState;
let currentUser;

const self = {}; // TODO: remove once fat-arrow this substitution is fixed in es6 transpiler
module.exports = _.extend(self, Store(
  // waitFor other Stores
  [], {
  // action handlers
  LOADING_CURRENT_USER: (actionData) => {
    currentUser = undefined;
    return true;
  },

  CURRENT_USER_UPDATED: (actionData) => {
    currentUser = actionData;
    return true;
  },

  LOGIN_DONE: (actionData) => {
    loginState = C.LOGIN_DONE;
    return true;
  },

  LOGIN_FAILED: (actionData) => {
    loginState = C.LOGIN_FAILED;
    return true;
  },

  LOGIN_STARTED: () => {
    loginState = C.LOGIN_STARTED;
    return true;
  },

}, {
  // custom getters
  getLoginState() {
    return loginState;
  },

  getCurrentUser(){
    return currentUser;
  }

}));

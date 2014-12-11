'use strict';

const keyMirror = require('react/lib/keyMirror');

module.exports = {

  ActionTypes: keyMirror({
    CLICK_PAGE_SELECTOR: null,
    CLICK_TAB_SELECTOR: null,
    CASHFLOW_POINT_SELECTED: null,
    CASHFLOW_UPDATED: null,
    MAIN_CFF_UPDATED: null,
    BANK_CFF_UPDATED: null,
    CURRENT_USER_UPDATED: null,
    LOADING_MAIN_CFF: null,
    LOADING_CURRENT_USER: null,
    LOGIN_STARTED: null,
    LOGIN_FAILED: null,
    LOGIN_DONE: null,
  }),

  PayloadSources: keyMirror({
    VIEW_ACTION: null
  })

};
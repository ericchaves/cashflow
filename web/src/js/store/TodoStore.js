'use strict';

const alt = require('../alt');
const utils = require('../utils/utils.js');
const TodoDataStore = require('./TodoDataStore');
const MatchActions = require('../actions/MatchActions');
const TodoActions = require('../actions/TodoActions');

class TodoStore {
  constructor() {
    this.bindActions(MatchActions);
    this.bindActions(TodoActions);
    this.bindAction(MatchActions.getMatchesSuccess, this.updateData);
    this.bindAction(MatchActions.stageMatchOptimistic, this.updateData);
    this.bindAction(MatchActions.stageMatchFail, this.updateData);
    this.bindAction(MatchActions.unstageMatchOptimistic, this.updateData);
    this.bindAction(MatchActions.unstageMatchFail, this.updateData);
    this.bindAction(MatchActions.deleteMatchOptimistic, this.updateData);
    this.bindAction(MatchActions.deleteMatchFail, this.updateData);
    this.pointOfView = 'main';
    this.selectedMatch = undefined;
  }

  updateData() {
    this.waitFor(TodoDataStore.dispatchToken);
    this.selectedMatch = undefined;
    this.selectedPaymentId = undefined;
    const payments = TodoDataStore.getAll();
    const dataPayments = payments.filter((p) => p.type === 'data');
    const mainPayments = payments.filter((p) => p.type === 'certain' || p.type === 'uncertain');
    this.ficMatches = mainPayments.map((payment) => {
      payment.matches = payment.matches.map((id) => TodoDataStore.get(id)).filter((p) => p);
      return payment;
    }).sort(utils.sortByMatchesNumber);
    this.dataMatches = dataPayments.map((payment) => {
      payment.matches = payment.matches.map((id) => TodoDataStore.get(id)).filter((p) => p);
      return payment;
    }).sort(utils.sortByMatchesNumber);
    this.mainPayments = mainPayments;
    this.dataPayments = dataPayments;
  }

  onSelectMatch(match) {
    this.selectedMatch = match;
    this.selectedPaymentId = undefined;
  }

  onSelectPayment(paymentId) {
    this.selectedPaymentId = paymentId;
  }

}

module.exports = alt.createStore(TodoStore, 'TodoStore');

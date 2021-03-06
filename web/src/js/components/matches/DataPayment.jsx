/** @jsx React.DOM */

'use strict';

const React = require('react');
const utils = require('../../utils/utils.js');

const DataPayment = React.createClass({

  propTypes: {
    dataPayment: React.PropTypes.object.isRequired
  },

  render: function() {
    const dataPayment = this.props.dataPayment;
    const isInvoice = dataPayment.info.flowDirection === 'in';
    const currency = utils.getPaymentCurrency(dataPayment);

    return (
      <div>
        <div><strong>Valore:</strong> {isInvoice ? '' : '-'}{dataPayment.grossAmount}{currency}</div>
        <div><strong>Data:</strong> {utils.formatDate(dataPayment.date)}</div>
        <div><strong>Metodo:</strong> {dataPayment.method}</div>
        <div><strong>Descrizione:</strong> {dataPayment.info.description}</div>
      </div>
    );
  },

});

module.exports = DataPayment;

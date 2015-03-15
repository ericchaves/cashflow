/** @jsx React.DOM */

'use strict';

const React = require('react');
const TodoActions = require('../../../actions/TodoActions.js');
const utils = require('../../../utils/utils.js');

const MatchPreview = React.createClass({

  propTypes: {
    match: React.PropTypes.object.isRequired,
    isSelected: React.PropTypes.bool.isRequired,
    index: React.PropTypes.number.isRequired,
  },

  setAsSelected: function() {
    const index = this.props.index;
    TodoActions.selectMatch(index);
  },

  render: function() {
    const match = this.props.match;
    const isSelected = this.props.isSelected;
    const divClasses = isSelected ? 'ui secondary segment green selectable' : 'ui secondary segment selectable';
    const lineId = match.info.lineId;
    const type = match.info.flowDirection === 'in' ? 'Invoice' : 'Expense';
    const date = utils.formatDate(typeof match.date !== 'undefined' ? match.date : match.expectedDate[0]);
    // const idNumber = lineId.replace('exp_', '').replace('inv_', '');
    const paymentNumber = typeof match.scraperInfo === 'undefined' ? 1 :
      parseInt(match.scraperInfo.tranId.replace('tran_', '').replace('_', '')) + 1;

    return (
      <div>
        <br></br>
        <div className={divClasses} onClick={this.setAsSelected}>
          <div className="ui top attached label">
            <p>{match.info.description}</p>
            <p>{date}</p>
          </div>
          <div className='ui mini statistic'>
            <div className='label'>
              {type}
            </div>
            <div className='value'>
              {date}
            </div>
            <div className='value'>
              {match.matches.length}
            </div>
            <div className='label'>
              {match.matches.length === 1 ? 'match' : 'matches'}
            </div>
          </div>
        </div>
      </div>
    );

    // const match = this.props.match;
    // const isSelected = this.props.isSelected;
    // const divClasses = isSelected ? 'ui segment green center aligned selectable' : 'ui segment center aligned selectable';
    // const lineId = match.info.lineId;
    // const type = match.info.flowDirection === 'in' ? 'Invoice' : 'Expense';
    // const date = utils.formatDate(typeof match.info.invoice === 'undefined' ? match.date : match.info.invoice.date);
    // // const idNumber = lineId.replace('exp_', '').replace('inv_', '');
    // const paymentNumber = typeof match.scraperInfo === 'undefined' ? 1 :
    //   parseInt(match.scraperInfo.tranId.replace('tran_', '').replace('_', '')) + 1;

    // return (
    //   <div className={divClasses} onClick={this.setAsSelected}>
    //     <div className='ui mini statistic'>
    //       <div className='value'>
    //         {type}
    //       </div>
    //       <div className='value'>
    //         {date}
    //       </div>
    //       <div className='label'>
    //         {paymentNumber}º payment
    //       </div>
    //     </div>
    //     <div className='ui mini statistic'>
    //       <div className='value'>
    //         {match.matches.length}
    //       </div>
    //       <div className='label'>
    //         {match.matches.length === 1 ? 'match' : 'matches'}
    //       </div>
    //     </div>
    //   </div>
    // );
  },

});

module.exports = MatchPreview;

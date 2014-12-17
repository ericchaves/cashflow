/** @jsx React.DOM */

'use strict';

const React = require('react');
const PageSelector = require('./PageSelector.jsx');
const Link = require('react-router').Link;


const SideBar = React.createClass({

  render: function () {

    // const pageSelectors = this.props.pages.map((page, index) =>
    //   <PageSelector page={page} selectedPage={this.props.selectedPage} selectedTab={this.props.selectedTab} key={index}/>);

    const selectedPage = this.props.selectedPage;
    const pages = this.props.pages.map((page, index) => {
      const classes = page.id === selectedPage ? 'active item' : 'item';
      return (
        <Link className={classes} to={page.id} key={index}>
          {page.name}
        </Link>
      );
    });

    const currentTabs = this.props.pages.filter((page) => page.id === selectedPage)[0].tabs;
    const tabs = currentTabs.map((tab, index) => {
      return (
        <Link className="item" to={tab.id} key={index}>
          {tab.name}
        </Link>
      );
    });

    return (
      <div className="ui tiered menu">
        <div className="menu">
          {pages}
          <div className="right menu">
            <div className="item">
              <div className="ui icon input">
                <input type="text" placeholder="Search..."/>
                <i className="search icon"></i>
              </div>
            </div>
            <div className="ui dropdown item">
              More
              <i className="icon dropdown"></i>
              <div className="menu">
                <a className="item"><i className="edit icon"></i> Edit Profile</a>
                <a className="item"><i className="globe icon"></i> Choose Language</a>
                <a className="item"><i className="settings icon"></i> Account Settings</a>
              </div>
            </div>
          </div>
        </div>
        <div className="ui sub menu">
          {tabs}
        </div>
      </div>
    );

    // return (
    //   <div className='sideBar'>
    //     <h4 className='ui top attached inverted header'>
    //       PAGES
    //     </h4>
    //     <div className='ui top attached fluid vertical menu'>
    //       {pageSelectors}
    //     </div>
    //   </div>
    // );
  }

});

module.exports = SideBar;

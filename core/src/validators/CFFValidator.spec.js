'use strict';

/*globals describe, it */
/*jshint expr: true*/

const Immutable = require('immutable');
const assert = require('assert');
const chai = require('chai');
chai.use(require('chai-things'));
const expect = chai.expect;
const validateCFF = require('./CFFValidator.js');

const validateAll = (cffs, validator) => {
  const errors = cffs.reduce(
    (acc, cff) => {
      const cffErrors = validator(cff).get('errors') || Immutable.List();
      return acc.concat(cffErrors);
    },
    Immutable.List()
  );
  return errors.size > 0 ? Immutable.Map({errors: errors}) : Immutable.Map();
};

describe('validateCff', () => {
  it('should reject invalid object', () => {
    const cffs = ['string'];
    const immutableCFFs = Immutable.fromJS(cffs);
    const report = validateAll(immutableCFFs, validateCFF).toJS();
    const x = report.errors;
    expect(Array.isArray(x)).to.be.true;
    expect(x).to.have.length(1)
      .and.to.contain.an.item.with.property('msg', 'CFF is not a valid JSON object');
    expect(x).to.all.have.property('sourceId', 'UNKNOWN_SOURCE_ID');
  });

  it('should require valid sourceId, sourceDescription and lines', () => {
    const cffs = [
      {
        priority: 'a'
      }
    ];
    const immutableCFFs = Immutable.fromJS(cffs);
    const report = validateAll(immutableCFFs, validateCFF).toJS();
    const x = report.errors;
    expect(Array.isArray(x)).to.be.true;
    expect(x).to.have.length(4)
      .and.to.contain.an.item.with.property('msg', 'sourceId missing or invalid')
      .and.to.contain.an.item.with.property('msg', 'sourceDescription missing or invalid')
      .and.to.contain.an.item.with.property('msg', 'lines missing or not Array')
      .and.to.contain.an.item.with.property('msg', 'priority is invalid')
      .and.to.all.have.property('sourceId', 'UNKNOWN_SOURCE_ID');
  });

  it('should return errors with sourceId', () => {
    const cffs = [
      {sourceId: 'SOURCE_ID'}
    ];
    const immutableCFFs = Immutable.fromJS(cffs);
    const report = validateAll(immutableCFFs, validateCFF).toJS();
    const x = report.errors;
    expect(Array.isArray(x)).to.be.true;
    expect(x).to.have.length.at.least(1)
      .and.to.all.have.property('sourceId', 'SOURCE_ID');
  });

  it('should require each line to have a uniqueID', () => {
    const cffs = [
      {
        sourceId: 'SOURCE_ID',
        sourceDescription: 'desc',
        lines: [
          {
            id: 'NOT_UNIQUE_ID'
          },
          {
            id: 'NOT_UNIQUE_ID'
          }
        ]
      }
    ];
    const immutableCFFs = Immutable.fromJS(cffs);
    const report = validateAll(immutableCFFs, validateCFF).toJS();
    const errors = report.errors;
    expect(Array.isArray(errors)).to.be.true;
    expect(errors).to.contain.and.item.with.property('msg', 'lines must have unique IDs (or undefined)');
  });

  it('should not return errors', () => {
    const cffs = [
      {
        sourceId: 'SOURCE_ID',
        sourceDescription: 'desc',
        lines: [
          {
            id: 'UNIQUE_ID'
          },
          {},
          {}
        ]
      }
    ];
    const immutableCFFs = Immutable.fromJS(cffs);
    const report = validateAll(immutableCFFs, validateCFF).toJS();
    expect(typeof report === 'object' && !Array.isArray(report)).to.be.true;
    expect(report).to.not.have.property('errors');
  });

});

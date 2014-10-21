'use strict';

const Immutable = require('immutable');

const applyRulesToLines = (lines, rules) => {
  return lines.map((line) => {
    const matchedRules = rules.filter((rule) => rule.match(line));
    return matchedRules.length > 0 ?
      matchedRules.reduce((acc, rule) => rule.edit(acc), line) : line;
  });
};

const applyHeuristicRulesToCFF = (cff, rules) => {
  const editedLines = applyRulesToLines(cff.get('lines'), rules || []);
  return cff.set('lines', editedLines);
};

module.exports = applyHeuristicRulesToCFF;
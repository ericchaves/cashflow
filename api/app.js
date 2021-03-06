'use strict';

var MongoClient = require('mongodb').MongoClient;
var ObjectId = require('mongodb').ObjectID;
// var assert = require('assert');
var comongo = require('co-mongo');
var co = require('co');
var koa = require('koa');
var app = koa();
var router = require('koa-router');
var bodyParser = require('koa-body-parser');
var compress = require('koa-compress');
var randtoken = require('rand-token');
var passwordHash = require('password-hash');
var scrapers = require('./src/scrapers.js');
var jsendify = require('./src/jsendify.js');
var utils = require('./src/utils.js');
var saveOnFattureInCloud = require('cff-manager-assistant').saveOnFattureInCloud;
var getMatches = require('cff-manager-assistant').getMatches;
var config = require('./config.json');
var db;

var HOST = 'localhost';

// init router to use app.get()
app.use(compress());
app.use(jsendify());
app.use(bodyParser());

//FIXME: CORS need to be better configured
app.use(function *(next) {
  if (app.env === 'development') {
    this.set('Access-Control-Allow-Origin', '*');
    this.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Override-Status-Code');
    this.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS, DELETE');
  }
  yield next;
});

app.use(router(app));

comongo.configure({
  host: config.db.host,
  port: config.db.port,
  name: config.db.name,
  pool: 10,
  collections: ['users', 'credentials', 'cffs', 'projects', 'resources', 'sessions', 'progresses', 'bankSessions', 'matches', 'stagedMatches']
});

// init db
co(function *() {
  db = yield comongo.get();
});

// USERS
// signup
app.post('/users', function *() {
  var email = this.request.body.email;
  var password = this.request.body.password;

  if (!email || !password) {
    this.throw(400, 'email and password must be set in request body');
  }
  var user = yield db.users.findOne({'credentials.login.email': email});
  if(user){
    // error
    this.throw(400, 'user already exists');
  } else {
    var newUser = {
      credentials: {
        login: {
          email: email,
          password: passwordHash.generate(password)
        },
      }
    };
    yield db.users.insert(newUser);
  }
});

// login
app.post('/login', function* () {
  var email = this.request.body.email;
  var password = this.request.body.password;

  if (!email || !password) {
    this.throw(400, 'email and password must be set in request body');
  }
  var user = yield db.users.findOne({'credentials.login.email': email});

  if (!user) {
    this.throw(400, 'user does not exists');
  }
  if (!passwordHash.verify(password, user.credentials.login.password)) {
    this.throw(400, 'wrong password');
  }

  var token = randtoken.generate(16);
  yield db.sessions.update({userId: user._id}, {userId: user._id, token: token}, {upsert: true});
  this.objectName = 'credentials';
  this.body = {token: token};
});

app.get('/users/me', function *() {
  var token = utils.parseAuthorization(this.request.header.authorization);
  var user = yield utils.getUserByToken(db, token);
  this.objectName = 'user';
  var body = {
    id: user._id,
    email: user.credentials.login.email
  };
  this.body = body;
});

// CREDENTIALS
app.post('/users/credentials', function *() {
  var token = utils.parseAuthorization(this.request.header.authorization);
  var user = yield utils.getUserByToken(db, token);
  console.log(this.request.body);
  var type = this.request.body.type;
  var bankId = this.request.body.bankId;
  var credentials = this.request.body.credentials;

  if (!credentials) {
    this.throw(400, 'credentials are missing or incorrect');
  }

  if(!user){
    // error
  }
  var update = type === 'main' ? {userId: user._id, type: type} : {userId: user._id, type: type, bankId: bankId};
  yield db.credentials.update(update, {$set: {credentials: credentials, bankId: bankId}}, {upsert : true});
});

// CFFS
app.get('/cffs/main', function *() {
  var token = utils.parseAuthorization(this.request.header.authorization);
  var user = yield utils.getUserByToken(db, token);
  var mainLines = yield db.cffs.find({userId: user._id, type: 'main'}).toArray();
  if (mainLines.length === 0) {
    this.throw(400, 'user does not have a main cff in database');
  }
  this.objectName = 'cffs';
  this.body = { main: utils.getCffFromDocumentLines(mainLines)};
});

app.post('/cffs/main/pull', function *() {
  var token = utils.parseAuthorization(this.request.header.authorization);
  var user = yield utils.getUserByToken(db, token);
  // fai partire scrapers, aggiorna.
  var credentialsFattureInCloud = yield db.credentials.findOne({userId: user._id, type: 'main'});
  if (!credentialsFattureInCloud) {
    this.throw(400, 'fattureincloud credentials not found');
  }
  var mainLines = yield db.cffs.find({userId: user._id, type: 'main'}).toArray();
  var oldCFF = mainLines.length === 0 ? {lines: []} : utils.getCffFromDocumentLines(mainLines);
  // fatture in cloud non deve essere bloccante, usare /progress per conoscere stato avanzamento
  scrapers.getFattureInCloud(db, user._id, credentialsFattureInCloud, oldCFF)
    .done(function(result) {
      co(function *() {
        var cff = result.fattureInCloud.cff;
        const allIDs = cff.lines.map(function (line) {return line.id;}).join(' '); // string of valid IDs
        const linesToBeRemoved = oldCFF.lines.filter(function (line) {return allIDs.indexOf(line.id) === -1;}); // get old lines with invalid IDs
        // remove invalid lines
        yield linesToBeRemoved.map(function(line) {
          return {
            remove: db.cffs.remove({userId: user._id, type: 'main', id: line.id})
          };
        });
        // overwrite valid lines
        yield cff.lines.map(function(line) {
          line.sourceId = cff.sourceId;
          line.sourceDescription = cff.sourceDescription;
          var regExp = new RegExp(line.id, '');
          return {
            update: db.cffs.update({userId: user._id, type: 'main', id: line.id}, {$set: {line: line}}, {upsert: true}),
            removeMatches: db.matches.remove({userId: user._id, id: {'$regex': regExp}}),
            removeStagedMatches: db.stagedMatches.remove({userId: user._id, id: {'$regex': regExp}})
          };
        });
      });
    });
});

app.get('/cffs/main/pull/progress', function *() {
  var token = utils.parseAuthorization(this.request.header.authorization);
  var user = yield utils.getUserByToken(db, token);
  var fattureInCloudProgress = yield db.progresses.findOne({userId: user._id, type: 'fattureincloud'});
  this.objectName = 'progress';
  this.body = fattureInCloudProgress ? fattureInCloudProgress.progress : undefined;
});

app.post('/cffs/main/pull/progress/clear', function *() {
  var token = utils.parseAuthorization(this.request.header.authorization);
  var user = yield utils.getUserByToken(db, token);
  yield db.progresses.remove({userId: user._id, type: 'fattureincloud'});
});

app.get('/cffs/bank', function *() {
  var token = utils.parseAuthorization(this.request.header.authorization);
  var user = yield utils.getUserByToken(db, token);
  var bankLines = yield db.cffs.find({userId: user._id, type: 'bank'}).toArray();
  if (bankLines.length === 0) {
    this.throw(400, 'user does not have a bank cff in database');
  }
  var lines = bankLines.map(function(docLine) {return docLine.line;});
  var sortedLines = lines.sort(utils.sortCFFLinesByDate);
  var cff = {
    sourceId: 'BANK',
    sourceDescription: 'payments scraped from user bank accounts',
    lines: sortedLines
  };
  this.objectName = 'cffs';
  this.body = {bank: cff};
});

app.post('/cffs/bank/pull', function *() {
  var token = utils.parseAuthorization(this.request.header.authorization);
  var user = yield utils.getUserByToken(db, token);
  var captcha = this.query.captcha;
  var inputParameters = {
    cff: true
  };

  if (captcha) {
    var bankSession = yield db.bankSessions.findOne({userId: user._id, bankId: 'bper'});
    inputParameters.captcha = captcha;
    inputParameters.cookies = bankSession.cookies;
    console.log(captcha, bankSession.cookies);
  }
  // fai partire scrapers, aggiorna.
  var bankCredentialsArray = yield db.credentials.find({userId: user._id, type: 'bank'}).toArray();
  if (bankCredentialsArray.length === 0) {
    this.throw(400, 'BPER and BPER-CREDIT-CARD credentials are missing');
  }

  var bperCredentials = yield db.credentials.findOne({userId: user._id, type: 'bank', bankId: 'bper'});
  if (!bperCredentials) {
    this.throw(404, 'BPER credentials are missing');
  }

  var bperCreditCardCredentials = yield db.credentials.findOne({userId: user._id, type: 'bank', bankId: 'bper-credit-card'});
  if (!bperCreditCardCredentials) {
    this.throw(404, 'BPER-CREDIT-CARD credentials are missing');
  }

  var reports = yield bankCredentialsArray.map(function(bankCredentials) {
    return co(function *() {
      var status = 'trying';
      var result;
      var attempts = 0;

      while (status === 'trying') {
        result = yield scrapers.getBank(bankCredentials, inputParameters);
        attempts += 1;
        status = result.bank.status.name === utils.unknownError && attempts < utils.maxAttempts ? 'trying' : result.bank.status.name;
      }

      return {
        bankId: bankCredentials.bankId,
        status: status,
        attempts: attempts,
        result: result
      };
    });
  });

  var error;

  reports.forEach(function(report) {
    co(function *() {
      switch (report.status) {
        case 'success':
          var cff = report.result.bank.cff;

          // retrieve stored lines
          var oldLines = yield db.cffs.find({userId: user._id, type: 'bank', bankId: report.bankId}).toArray();

          // *** SAFETY CHECK: old lines should exist in new cff (if date is recent enough)
          var oldestDate = cff.lines.map(function(line){return line.payments[0].date;})
              .reduce(function(acc, date){return date < acc ? date : acc;});
          if (oldestDate < '2015-06-15') {
            oldestDate = '2015-06-15';
          }
          var newLinesIDs = cff.lines.map(function(line) {return line.id;});
          var oldLinesNoLongerExisting = oldLines.filter(function(docLine) {
            return docLine.line.payments[0].date >= oldestDate && newLinesIDs.indexOf(docLine.line.id) === -1;
          });
          if (oldLinesNoLongerExisting.length > 0) {
            console.log('Warning: there might be duplicates in ' + report.bankId + '. New lines won\'t be saved in database');
            oldLinesNoLongerExisting.forEach(function(line) {
              console.log(line.line);
            });
            error = {number: 400, msg: 'Warning: there might be duplicates in ' + report.bankId + '. New lines won\'t be saved in database'};
            break;
          }
          // *** END SAFETY CHECK

          // (DEPRECATED: only new lines) var filteredNewLines = cff.lines.filter(function(line) {return oldLinesIDs.indexOf(line.id) === -1});

          // save (or overwrite) new lines
          yield cff.lines.map(function(line) {
            line.sourceId = cff.sourceId;
            line.sourceDescription = cff.sourceDescription;
            return {
              update: db.cffs.update({userId: user._id, type: 'bank', bankId: report.bankId, id: line.id}, {$set: {line: line}}, {upsert: true})
            };
          });
          break;

        case utils.unknownError:
          error = {number: 400, msg: 'reached maximum number of attempts (' + report.attempts + ')'};
          break;

        case utils.captchaError:
          var result = report.result;
          yield db.bankSessions.update({userId: user._id, bankId: 'bper'}, {$set: {cookies: result.bank.cookies}}, {upsert: true});
          this.objectName = 'captcha';
          console.log(result.bank.captcha);
          var b = new Buffer(result.bank.captcha);
          this.body = {captcha: b.toString('base64')};
          break;

        case utils.passwordError:
          yield db.credentials.remove({userId: user._id, type: 'bank', bankId: report.bankId});
          error = {number: 400, msg: report.result.bank.status.message};
          break;

        default:
          error = {number: 400, msg: report.result.bank.status.message};
      }
    });
  });

  if (error) {
    this.throw(error.number, error.msg);
  }
});

app.get('/cffs/manual', function *() {
  var token = utils.parseAuthorization(this.request.header.authorization);
  var user = yield utils.getUserByToken(db, token);
  var manualLines = yield db.cffs.find({userId: user._id, type: 'manual'}).toArray();
  if (manualLines.length === 0) {
    this.throw(400, 'user does not have a manual cff in database');
  }
  var lines = manualLines.map(function(docLine) {return {line: docLine.line, _id: docLine.id};});
  // var sortedLines = lines.sort(utils.sortCFFLinesByDate);
  // var cff = {
  //   sourceId: sortedLines[0].sourceId,
  //   sourceDescription: sortedLines[0].sourceDescription,
  //   lines: sortedLines
  // };
  this.objectName = 'cffs';
  this.body = {manualLines: lines};
});

app.post('/cffs/manual', function *() {
  var token = utils.parseAuthorization(this.request.header.authorization);
  var user = yield utils.getUserByToken(db, token);
  var line = this.request.body;
  delete line.id

  // const otherLineWithSameId = yield db.cffs.findOne({userId: user._id, type: 'manual', 'line.id': line.id});
  // if (otherLineWithSameId) {
  //   this.throw(400, 'Line with same id already existing');
  // }

  const query = {userId: user._id, type: 'manual', line: line};
  yield db.cffs.insert(query);

  const newLine = yield db.cffs.findOne(query);
  const generatedId = newLine._id.toString();

  yield db.cffs.update(newLine, {$set: {id: generatedId}}, {upsert: true});

  this.objectName = 'newLine';
  this.body = {
    line: newLine.line,
    _id: generatedId
  };
});

app.post('/cffs/manual/:lineId', function *() {
  var token = utils.parseAuthorization(this.request.header.authorization);
  var user = yield utils.getUserByToken(db, token);
  var lineId = this.params.lineId;
  var line = this.request.body;
  delete line.id

  // const otherLineWithSameId = yield db.cffs.findOne({userId: user._id, type: 'manual', id: {$ne: lineId}, 'line.id': line.id});
  // if (otherLineWithSameId) {
  //   this.throw(400, 'Line with same id already existing');
  // }

  yield db.cffs.update({userId: user._id, type: 'manual', id: lineId}, {$set: {line: line}}, {upsert: true});
});

app.delete('/cffs/manual/:lineId', function *() {
  var token = utils.parseAuthorization(this.request.header.authorization);
  var user = yield utils.getUserByToken(db, token);
  var lineId = this.params.lineId;
  yield db.cffs.remove({userId: user._id, type: 'manual', id: lineId});

  // REMOVE MATCHES
  yield db.matches.remove({userId: user._id, main: lineId});
  yield db.stagedMatches.remove({userId: user._id, main: lineId});
});

app.post('/matches/stage/commit', function*() {
  var token = utils.parseAuthorization(this.request.header.authorization);
  var user = yield utils.getUserByToken(db, token);

  var stagedMatches = yield db.stagedMatches.find({userId: user._id}).toArray();

  if (stagedMatches.length === 0) {
    this.throw(400, 'stage area is empty');
  }

  var credentialsFattureInCloud = yield db.credentials.findOne({userId: user._id, type: 'main'});
  if (!credentialsFattureInCloud) {
    this.throw(400, 'fattureincloud credentials not found');
  }

  var mainLines = yield db.cffs.find({userId: user._id, type: 'main'}).toArray();
  var manualLines = yield db.cffs.find({userId: user._id, type: 'manual'}).toArray();
  var _manualLines = yield db.cffs.find({userId: user._id, type: 'manual'}).toArray(); //FUCK MUTABLE & FUCK YIELD!!!
  var bankLines = yield db.cffs.find({userId: user._id, type: 'bank'}).toArray();

  var payments = utils.getPaymentsFromDocumentLines(mainLines).concat(utils.getPaymentsFromDocumentLines(bankLines)).concat(utils.getManualPaymentsFromDocumentLines(manualLines));
  var paymentsMap = payments.reduce(function(acc, payment) {
      acc[payment.id] = payment;
      return acc;
    },
    {}
  );

  var stagedPaymentsToSave = [];
  var stagedPaymentsToCommit = stagedMatches.filter(function(match) {
    var main = paymentsMap[match.main];
    var data = paymentsMap[match.data];
    // bypassing commit on FattureInCloud with false
    var toSaveOnline = false && typeof main !== 'undefined' && !(main.date === data.date && (main.grossAmount - data.grossAmount) < 0.01) && main.info.currency.name === data.info.currency.name;
    if (!toSaveOnline) {
      stagedPaymentsToSave.push(match);
    }
    return toSaveOnline;
  }).map(function(match) {
    var payment = paymentsMap[match.main];
    var dataPayment = paymentsMap[match.data];
    payment.grossAmount = dataPayment.grossAmount;
    payment.date = dataPayment.date;
    return payment;
  });

  stagedPaymentsToSave.forEach(function(match) {
    co(function *() {
      yield db.stagedMatches.remove(match);
      yield db.matches.insert(match);

      const manualLine = _manualLines.filter(function(m) {return m.id === match.main})[0];
      if (manualLine) {
        // UPDATE MANUAL LINE WITH CORRECT VALUES
        const dataPayment = paymentsMap[match.data]
        manualLine.line.currency = dataPayment.info.currency;
        manualLine.line.payments[0].date = dataPayment.date;
        manualLine.line.payments[0].grossAmount = dataPayment.grossAmount;
        manualLine.line.payments[0].method = dataPayment.method;
        manualLine.line.payments[0].methodType = dataPayment.methodType;
        yield db.cffs.update({userId: user._id, type: 'manual', id: manualLine.id}, {$set: {line: manualLine.line}}, {upsert: true});
      }
    });
  });

  var stagedLinesToCommit = stagedPaymentsToCommit.reduce(function(acc, payment) {
      if (!acc[payment.info.lineId]) {
        const newLine = JSON.parse(JSON.stringify(payment.info));
        delete payment.info;
        newLine.id = newLine.lineId;
        newLine.payments = [payment];
        acc[newLine.id] = newLine;
      } else {
        acc[payment.info.lineId].payments.push(payment);
      }
      return acc;
    },
    {}
  );

  var stagedPaymentsIDs = stagedPaymentsToCommit.map(function(payment) {return payment.id;}).join('|');
  // add stagedPayments of same line not staged
  var completeLines = yield utils.getArrayFromObject(stagedLinesToCommit).map(function (stagedLine) {
    return db.cffs.findOne({userId: user._id, id: stagedLine.id});
  });
  completeLines.forEach(function(docLine) {
    docLine.line.payments.forEach(function(payment) {
      if (stagedPaymentsIDs.indexOf(payment.id) === -1) {
        stagedLinesToCommit[docLine._id].payments.push(payment);
      }
    });
  });

  stagedLinesToCommit = utils.getArrayFromObject(stagedLinesToCommit);

  var getNewPaymentId = function(paymentId, oldLineId, newLineId) {
    return paymentId.replace(oldLineId, newLineId);
  };

  var errorLinesIDs = [];
  var results = yield saveOnFattureInCloud(stagedLinesToCommit, credentialsFattureInCloud.credentials);
  results.forEach(function(res) {
    co(function *() {
      if (res.error) {
        errorLinesIDs.push(res.id);
      } else {
        var line = stagedLinesToCommit.filter(function(line) {return line.id === res.oldId;})[0];
        line.payments = line.payments.map(function(p) {
          p.id = p.id.replace(res.oldId, res.newId);
          return p;
        });
        line.id = res.newId;
        var toReturn = {};
        yield db.cffs.remove({userId: user._id, id: res.oldId});
        yield db.cffs.update({userId: user._id, type: 'main', id: line.id}, {$set: {line: line}}, {upsert: true});
        var regExp = new RegExp(res.oldId, '');
        var matches = yield db.stagedMatches.find({userId: user._id, main: {'$regex': regExp}}).toArray();
        yield matches.map(function(match) {
          match.main = match.main.replace(res.oldId, res.newId);
          return {
            remove: db.stagedMatches.remove(match),
            insert: db.matches.insert(match)
          };
        });
      }
    });
  });
  if (errorLinesIDs.length > 0) {
    console.log(errorLinesIDs);
  }
});

app.get('/matches', function *() {
  var token = utils.parseAuthorization(this.request.header.authorization);
  var user = yield utils.getUserByToken(db, token);

  var mainLines = yield db.cffs.find({userId: user._id, type: 'main'}).toArray();
  var bankLines = yield db.cffs.find({userId: user._id, type: 'bank'}).toArray();
  var manualLines = yield db.cffs.find({userId: user._id, type: 'manual'}).toArray();

  if (mainLines.length === 0 || (bankLines.length === 0 && manualLines.length === 0)) {
    this.throw(400, 'database is incomplete, please run scrapers.');
  }

  var matches = yield db.matches.find({userId: user._id}).toArray();
  var stagedMatches = yield db.stagedMatches.find({userId: user._id}).toArray();

  var mainPaymentsIDs = matches.concat(stagedMatches).map(function(match) {return match.main;});
  var dataPaymentsIDs = matches.concat(stagedMatches).map(function(match) {return match.data;});

  var mainPayments = utils.getPaymentsFromDocumentLines(mainLines);
  var dataPayments = utils.getPaymentsFromDocumentLines(bankLines);
  var manualPayments = utils.getManualPaymentsFromDocumentLines(manualLines);

  // merge manual payments with FIC payments
  mainPayments = mainPayments.concat(manualPayments);

  var filteredMainPayments = mainPayments.filter(function(mainPayment) {
    return mainPaymentsIDs.indexOf(mainPayment.id) === -1;
  });

  var filteredDataPayments = dataPayments.filter(function(dataPayment) {
    return dataPaymentsIDs.indexOf(dataPayment.id) === -1 && dataPayment.methodType !== 'ignore';
  });

  const allMatches = getMatches({
    data: dataPayments,
    main: mainPayments
  });

  const firstDayOfYear = [(new Date()).getFullYear(), '01', '01'].join('-');

  const filterByDate = function(payment) {
    return !payment.date || payment.date >= firstDayOfYear;
  };

  // create body
  const todo = getMatches({
    data: filteredDataPayments.filter(filterByDate),
    main: filteredMainPayments.filter(filterByDate)
  });

  const toRemove = [];

  const stage = stagedMatches.map(function(match, index) {
    const payments = ['main', 'data'].map(function(type) {
      return allMatches[type].filter(function(p) {return p.id === match[type];})[0];
    });

    if ((!payments[0] && match.main !== '_empty_') || (!payments[1] && match.data !== '_empty_')) {
      toRemove.push({match: match, collection: 'stagedMatches'});
      return;
    }

    return {
      id: match.main + match.data,
      main: payments[0],
      data: payments[1]
    };
  }).filter(function(x){ return x;});

  const done = matches.map(function(match, index) {
    const payments = ['main', 'data'].map(function(type) {
      return allMatches[type].filter(function(p) {return p.id === match[type];})[0];
    });

    if ((!payments[0] && match.main !== '_empty_') || (!payments[1] && match.data !== '_empty_')) {
      toRemove.push({match: match, collection: 'matches'});
      return;
    }

    return {
      id: match.main + match.data,
      main: payments[0],
      data: payments[1]
    };
  }).filter(function(x){ return x;});


  var a = yield toRemove.map(function(obj) {
    return {
      remove: db[obj.collection].remove(obj.match)
    };
  });

  this.objectName = 'matches';
  this.body = {
    todo: todo,
    stage: stage,
    done: done
  };
});

app.post('/matches/stage/clear', function *() {
  var token = utils.parseAuthorization(this.request.header.authorization);
  var user = yield utils.getUserByToken(db, token);
  yield db.stagedMatches.remove({userId: user._id});
});

app.delete('/matches/stage/:matchId', function *() {
  var token = utils.parseAuthorization(this.request.header.authorization);
  var user = yield utils.getUserByToken(db, token);
  var matchId = this.params.matchId;
  yield db.stagedMatches.remove({userId: user._id, id: matchId});
});

app.put('/matches/stage/mainPaymentId/:mainPaymentId/dataPaymentId/:dataPaymentId', function *() {
  var token = utils.parseAuthorization(this.request.header.authorization);
  var user = yield utils.getUserByToken(db, token);
  var mainPaymentId = this.params.mainPaymentId;
  var dataPaymentId = this.params.dataPaymentId;

  var mainLines = yield db.cffs.find({userId: user._id, type: 'main'}).toArray();
  var bankLines = yield db.cffs.find({userId: user._id, type: 'bank'}).toArray();

  if (mainLines.length === 0) {
    this.throw(400, 'user does not have a main CFF');
  }
  if (bankLines.length === 0) {
    this.throw(400, 'user does not have a data CFF');
  }

  var mainPayment = utils.getPaymentsFromDocumentLines(mainLines).filter(function(p) {
    return p.id === mainPaymentId;
  });
  var dataPayment = utils.getPaymentsFromDocumentLines(bankLines).filter(function(p) {
    return p.id === dataPaymentId;
  });

  if (!mainPayment) {
    this.throw(400, 'the given mainPaymentId does not correspond to any payment');
  }
  if (!dataPayment) {
    this.throw(400, 'the given dataPaymentId does not correspond to any payment');
  }

  yield db.stagedMatches.insert({
    userId: user._id,
    id: mainPaymentId + dataPaymentId,
    main: mainPaymentId,
    data: dataPaymentId
  });
});

app.delete('/matches/:matchId', function *() {
  var token = utils.parseAuthorization(this.request.header.authorization);
  var user = yield utils.getUserByToken(db, token);
  var matchId = this.params.matchId;
  yield db.matches.remove({userId: user._id, id: matchId});
});

app.get('/projects', function *() {
  //
});

app.get('/resources', function *() {
  //
});

app.listen(9000);


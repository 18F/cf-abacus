'use strict';

const commander = require('commander');
const cp = require('child_process');
const _ = require('underscore');
const util = require('util');
const jwt = require('jsonwebtoken');

const request = require('abacus-request');
const router = require('abacus-router');
const express = require('abacus-express');

const clone = _.clone;

// Setup the debug log
const debug = require('abacus-debug')('abacus-cf-bridge-itest');

// Module directory
const moduleDir = (module) => {
  const path = require.resolve(module);
  return path.substr(0, path.indexOf(module + '/') + module.length);
};

const timeWindows = {
  'second' : 0,
  'minute' : 1,
  'hour'   : 2,
  'day'    : 3,
  'month'  : 4
};

// Checks if the difference between start and end time fall within a window
const isWithinWindow = (start, end, timeWindow) => {
  // [Second, Minute, Hour, Day, Month]
  const timescale = [1, 100, 10000, 1000000, 100000000];
  // Converts a millisecond number to a format a number that is YYYYMMDDHHmmSS
  const dateUTCNumbify = (t) => {
    const d = new Date(t);
    return d.getUTCFullYear() * 10000000000 + d.getUTCMonth() * timescale[4]
      + d.getUTCDate() * timescale[3] + d.getUTCHours() * timescale[2]
      + d.getUTCMinutes() * timescale[1] + d.getUTCSeconds();
  };

  return Math.floor(dateUTCNumbify(end) / timescale[timeWindow]) -
    Math.floor(dateUTCNumbify(start) / timescale[timeWindow]) === 0;
};

// Parse command line options
const argv = clone(process.argv);
argv.splice(1, 1, 'usage-collector-itest');
commander
  .option('-t, --start-timeout <n>',
    'external processes start timeout in milliseconds', parseInt)
  .option('-x, --total-timeout <n>',
    'test timeout in milliseconds', parseInt)
  .allowUnknownOption(true)
  .parse(argv);

// External Abacus processes start timeout
const startTimeout = commander.startTimeout || 10000;

// This test timeout
const totalTimeout = commander.totalTimeout || 60000;

// Token setup
process.env.API = 'http://localhost:4321';

process.env.CF_CLIENT_ID = 'abacus-cf-bridge';
process.env.CF_CLIENT_SECRET = 'secret';

process.env.CLIENT_ID = 'abacus-linux-container';
process.env.CLIENT_SECRET = 'secret';
const tokenSecret = 'secret';
const tokenAlgorithm = 'HS256';
process.env.JWTKEY = tokenSecret;
process.env.JWTALGO = tokenAlgorithm;

const resourceToken = {
  header: {
    alg: tokenAlgorithm
  },
  payload: {
    jti: '254abca5-1c25-40c5-99d7-2cc641791517',
    sub: 'abacus-cf-bridge',
    authorities: [
      'abacus.usage.linux-container.write',
      'abacus.usage.linux-container.read'
    ],
    scope: [
      'abacus.usage.linux-container.read',
      'abacus.usage.linux-container.write'
    ],
    client_id: 'abacus-cf-bridge',
    cid: 'abacus-cf-bridge',
    azp: 'abacus-cf-bridge',
    grant_type: 'client_credentials',
    rev_sig: '2cf89595',
    iat: 1456147679,
    exp: 1456190879,
    iss: 'https://localhost:1234/oauth/token',
    zid: 'uaa',
    aud: [
      'abacus-cf-bridge',
      'abacus.usage.linux-container'
    ]
  },
  signature: 'irxoV230hkDJenXoTSHQFfqzoUl353lS2URo1fJm21Y'
};

const systemToken = {
  header: {
    alg: tokenAlgorithm
  },
  payload: {
    jti: '254abca5-1c25-40c5-99d7-2cc641791517',
    sub: 'abacus-cf-bridge',
    authorities: [
      'abacus.usage.write',
      'abacus.usage.read'
    ],
    scope: [
      'abacus.usage.write',
      'abacus.usage.read'
    ],
    client_id: 'abacus-cf-bridge',
    cid: 'abacus-cf-bridge',
    azp: 'abacus-cf-bridge',
    grant_type: 'client_credentials',
    rev_sig: '2cf89595',
    iat: 1456147679,
    exp: 1456190879,
    iss: 'https://localhost:1234/oauth/token',
    zid: 'uaa',
    aud: [
      'abacus-cf-bridge',
      'abacus.usage'
    ]
  },
  signature: 'OVNTKTvu-yHI6QXmYxtPeJZofNddX36Mx1q4PDWuYQE'
};

const signedResourceToken = jwt.sign(resourceToken.payload, tokenSecret, {
  expiresIn: 43200
});
const signedSystemToken = jwt.sign(systemToken.payload, tokenSecret, {
  expiresIn: 43200
});


const test = (secured) => {
  let server;
  let submittime = new Date();

  beforeEach(() => {
    // Enable/disable the oAuth token authorization
    process.env.SECURED = secured ? 'true' : 'false';
    debug('Set SECURED = %s', process.env.SECURED);

    const start = (module) => {
      debug('Starting %s in directory %s', module, moduleDir(module));
      const c = cp.spawn('npm', ['run', 'start'], {
        cwd: moduleDir(module),
        env: clone(process.env)
      });

      // Add listeners to stdout, stderr and exit message and forward the
      // messages to debug logs
      c.stdout.on('data', (data) => process.stdout.write(data));
      c.stderr.on('data', (data) => process.stderr.write(data));
      c.on('exit', (code) => debug('Module %s started with code %d',
        module, code));
    };

    const app = express();
    const routes = router();
    routes.get('/v2/app_usage_events', (request, response) => {
      response.status(200).send({
        total_results: 1,
        total_pages: 1,
        prev_url: null,
        next_url: null,
        resources: [
          {
            metadata: {
              guid: '904419c4',
              url: '/v2/app_usage_events/904419c4',
              created_at: submittime.toISOString()
            },
            entity: {
              state: 'STARTED',
              memory_in_mb_per_instance: 512,
              instance_count: 1,
              app_guid: '35c4ff2f',
              app_name: 'app',
              space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
              space_name: 'diego',
              org_guid: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
              buildpack_guid: null,
              buildpack_name: null,
              package_state: 'PENDING',
              parent_app_guid: null,
              parent_app_name: null,
              process_type: 'web'
            }
          }
        ]
      });
    });
    routes.get('/v2/apps', (request, response) => {
      response.status(200).send({});
    });
    routes.get('/v2/info',
      (request, response) => {
        response.status(200).send({
          token_endpoint: 'http://localhost:4321'
        });
      });
    routes.get('/oauth/token',
      (request, response) => {
        response.status(200).send({
          token_type: 'bearer',
          access_token: signedResourceToken,
          expires_in: 100000,
          scope: 'abacus.usage.linux-container.read ' +
            'abacus.usage.linux-container.write',
          jti: '254abca5-1c25-40c5-99d7-2cc641791517'
        });
      });
    app.use(routes);
    app.use(router.batch(routes));
    server = app.listen(4321);

    if (!process.env.DB)
      start('abacus-pouchserver');
    start('abacus-eureka-plugin');
    start('abacus-authserver-plugin');
    start('abacus-provisioning-plugin');
    start('abacus-account-plugin');
    start('abacus-usage-collector');
    start('abacus-usage-meter');
    start('abacus-usage-accumulator');
    start('abacus-usage-aggregator');
    start('abacus-usage-reporting');
    start('abacus-cf-bridge');
  });

  afterEach((done) => {
    let counter = 11;
    const finishCb = (module, code) => {
      counter--;
      debug('Module %s exited with code %d. Left %d modules',
        module, code, counter);
      if (counter === 0) {
        debug('All modules stopped. Exiting test');
        done();
      }
    };

    const stop = (module, cb) => {
      debug('Stopping %s in directory %s', module, moduleDir(module));
      const c = cp.spawn('npm', ['run', 'stop'],
        { cwd: moduleDir(module), env: clone(process.env) });

      // Add listeners to stdout, stderr and exit message and forward the
      // messages to debug logs
      c.stdout.on('data', (data) => process.stdout.write(data));
      c.stderr.on('data', (data) => process.stderr.write(data));
      c.on('exit', (code) => cb(module, code));
    };

    stop('abacus-cf-bridge', finishCb);
    stop('abacus-usage-reporting', finishCb);
    stop('abacus-usage-aggregator', finishCb);
    stop('abacus-usage-accumulator', finishCb);
    stop('abacus-usage-meter', finishCb);
    stop('abacus-usage-collector', finishCb);
    stop('abacus-account-plugin', finishCb);
    stop('abacus-provisioning-plugin', finishCb);
    stop('abacus-authserver-plugin', finishCb);
    stop('abacus-eureka-plugin', finishCb);
    stop('abacus-pouchserver', finishCb);

    server.close();
  });

  const checkAllTimeWindows = (usage, reporttime) => {
    for (const windowType in timeWindows) {
      if(isWithinWindow(submittime, reporttime, timeWindows[windowType])) {
        const windowUsage = usage.windows[timeWindows[windowType]];
        expect(windowUsage[0].quantity.consuming).to.equal(0.5);
        expect(windowUsage[0].charge).to.be.above(0);
      }
    }
  };

  const checkReport = (cb) => {
    request.get('http://localhost:9088/v1/metering/organizations' +
      '/:organization_id/aggregated/usage', {
        organization_id: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
        headers: {
          authorization: 'bearer ' + signedResourceToken
        }
      },
      (error, response) => {
        try {
          expect(error).to.equal(undefined);

          expect(response.body).to.contain.all.keys('resources', 'spaces');
          const resources = response.body.resources;
          expect(resources.length).to.equal(1);
          expect(response.body.spaces.length).to.equal(1);
          const reporttime = new Date();

          expect(resources[0]).to.contain.all.keys(
            'plans', 'aggregated_usage');

          const planUsage = resources[0].plans[0].aggregated_usage[0];
          checkAllTimeWindows(planUsage, reporttime);

          const aggregatedUsage = resources[0].aggregated_usage[0];
          checkAllTimeWindows(aggregatedUsage, reporttime);

          cb();
        }
        catch (e) {
          const errorMsg = util.format('Check failed with %s.\n' +
            'Usage report:\n', e.stack,
            response ? JSON.stringify(response.body, null, 2) : 'unknown');
          cb(new Error(errorMsg, e));
        }
      });
  };

  const poll = (fn, done, timeout = 1000, interval = 100) => {
    const startTimestamp = Date.now();

    const doneCallback = (err) => {
      if (!err) {
        debug('Expectation in %s met', fn.name);
        setImmediate(() => done());
        return;
      }

      if (Date.now() - startTimestamp > timeout)
        setImmediate(() => done(new Error(util.format('Expectation not met ' +
          'for %d ms. Error: %o', timeout, err))));
      else
        setTimeout(() => {
          debug('Calling %s after >= %d ms...', fn.name, interval);
          fn(doneCallback);
        }, interval);
    };

    debug('Calling %s for the first time...', fn.name);
    fn(doneCallback);
  };

  it('submit runtime usage to usage collector', function(done) {
    this.timeout(totalTimeout + 2000);

    // Wait for bridge to start
    request.waitFor('http://localhost::p/v1/cf/bridge', { p: 9500 },
      startTimeout, (err, uri, opts) => {
        // Failed to ping bridge before timing out
        if (err) throw err;

        // Check report
        request.get(uri, {
          headers: {
            authorization: secured ? 'bearer ' + signedSystemToken : ''
          }
        }, (err, response) => {
          expect(err).to.equal(undefined);
          expect(response.statusCode).to.equal(200);

          poll(checkReport, done, totalTimeout, 1000);
        });
      }
    );
  });
};

describe('abacus-cf-bridge-itest without oAuth', () => test(false));

describe('abacus-cf-bridge-itest with oAuth', () => test(true));

const { expect } = require('chai');
const { spawn } = require('child_process');
const path = require('path');
const fbpClient = require('../lib/client');

describe('FBP Client with noflo-nodejs', () => {
  let nofloNodejs = null;
  let client = null;
  before(function (done) {
    this.timeout(60 * 1000);
    const nofloPath = path.resolve(__dirname, '../node_modules/.bin/noflo-nodejs');
    const baseDir = path.resolve(__dirname, '../');
    nofloNodejs = spawn('node', [
      nofloPath,
      '--host=localhost',
      '--port=3570',
      '--secret=fbp-client',
      `--basedir=${baseDir}`,
    ]);
    nofloNodejs.stdout.on('data', (data) => {
      const message = data.toString('utf8');
      if (message.indexOf('listening') !== -1) {
        done();
      }
    });
  });
  after(function (done) {
    this.timeout(60 * 1000);
    if (!nofloNodejs) {
      done();
      return;
    }
    nofloNodejs.on('close', () => {
      done();
    });
    nofloNodejs.kill();
  });
  describe('when instantiated', () => {
    it('should be able to connect', () => {
      return fbpClient({
        address: 'ws://localhost:3570',
        protocol: 'websocket',
        secret: 'fbp-client',
      })
        .then((c) => {
          client = c;
          return c.connect();
        });
    });
    it('should be marked as connected', () => {
      expect(client.isConnected()).to.equal(true);
    });
    it('should have updated runtime definition type', () => {
      expect(client.definition.type).to.equal('noflo-nodejs');
    });
  });
});

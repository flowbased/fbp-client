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
    it('should be able to connect again without side-effects', () => {
      client.adapter.__spec = true;
      return client.connect()
        .then(() => {
          expect(client.adapter.__spec).to.equal(true);
          delete client.adapter.__spec;
        });
    });
  });
  describe('when connected', () => {
    it('should be possible to get graph sources', () => {
      return client.protocol.component.getsource({
        name: client.definition.graph,
      })
        .then((res) => {
          expect(`${res.library}/${res.name}`).to.equal(client.definition.graph);
          expect(res.language).to.equal('json');
        });
    });
    it('should fail when adding a node to a non-existing graph', () => {
      return client.protocol.graph.addnode({
        id: 'foo',
        component: 'bar',
        graph: 'not-existing',
      })
        .then(() => { throw new Error('Unexpected success') })
        .catch((err) => {
          expect(err).to.be.an('error');
          expect(err.message).to.contain('graph not found');
        });
    });
    it('should be possible to list components', () => {
      return client.protocol.component.list()
        .then((components) => {
          expect(components).to.be.an('array');
          expect(components.length).to.be.above(5);
        });
    });
  });
  describe('setting up a project', () => {
    const componentName = 'foo/PlusOne';
    it('should be possible to send a custom component', () => {
      const code = `
const noflo = require('noflo');
const plusOne = function(val) {
  return parseInt(val, 10) + 1;
}
exports.getComponent = () => noflo.asComponent(plusOne);
      `;

      return client.protocol.component.source({
        name: 'PlusOne',
        language: 'javascript',
        library: 'foo',
        code,
      })
        .then((res) => {
          expect(res.name).to.equal(componentName);
          expect(res.inPorts.length).to.equal(1);
          expect(res.outPorts.length).to.equal(2);
        });
    });
  });
  describe('when disconnecting', () => {
    it('should be able to disconnect', () => {
      return client.disconnect();
    });
    it('should be marked as disconnected', () => {
      expect(client.isConnected()).to.not.equal(true);
    });
    it('should be able to disconnect again without side-effects', () => {
      client.adapter.__spec = true;
      return client.disconnect()
        .then(() => {
          expect(client.adapter.__spec).to.equal(true);
          delete client.adapter.__spec;
        });
    });
  });
  describe('registering commands after being disconnected', () => {
    after(() => {
      return client.disconnect();
    });
    it('should process commands sent while offline after reconnected', (done) => {
      client.protocol.component.getsource({
        name: client.definition.graph,
      })
        .then(() => {
          done();
        }, done);
      client.connect();
    });
  });
});

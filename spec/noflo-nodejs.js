const { expect } = require('chai');
const { spawn } = require('child_process');
const path = require('path');
const fbpClient = require('../lib/client');
const { Graph: fbpGraph } = require('fbp-graph');

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
    const signals = [];
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
          expect(res.name).to.equal('foo/PlusOne');
          expect(res.inPorts.length).to.equal(1);
          expect(res.outPorts.length).to.equal(2);
        });
    });
    it('should be possible to send a graph', () => {
      const graph = new fbpGraph('one-plus-one');
      graph.addNode('repeat', 'core/Repeat');
      graph.addNode('plus', 'foo/PlusOne');
      graph.addNode('output', 'core/Output');
      graph.addEdge('repeat', 'out', 'plus', 'val');
      graph.addEdge('plus', 'out', 'output', 'in');
      graph.addInitial(1, 'repeat', 'in');
      return client.protocol.graph.send(graph);
    });
    it('should be possible to start the graph', (done) => {
      const onSignal = (signal) => {
        signals.push(signal);
        // Wait for the network to finish
        if (signal.protocol === 'network' && signal.command === 'stopped') {
          client.removeListener('signal', onSignal);
          done();
        }
      };
      client.on('signal', onSignal);
      client.protocol.network.start({
        graph: 'one-plus-one',
      })
        .catch((err) => {
          client.removeListener('signal', onSignal);
          done(err);
        });
    });
    it('should tell that the network has finished', () => {
      return client.protocol.network.getstatus({
        graph: 'one-plus-one',
      })
        .then((status) => {
          expect(status.started).to.equal(false);
          expect(status.running).to.equal(false);
        });
    });
    it('should have emitted packet events as signals', () => {
      const packets = signals.filter(s => (s.protocol === 'network' && s.command === 'data'));
      expect(packets.length).to.equal(3);
      // IIP
      expect(packets[0].payload.src).to.be.an('undefined');
      expect(packets[0].payload.data).to.equal('1');
      // repeat -> plus
      expect(packets[1].payload.src).to.eql({
        node: 'repeat',
        port: 'out',
      });
      expect(packets[1].payload.data).to.equal('1');
      // repeat -> plus
      expect(packets[2].payload.src).to.eql({
        node: 'plus',
        port: 'out',
      });
      expect(packets[2].payload.data).to.equal('2');
    });
    it('should be possible to stop', () => {
      return client.protocol.network.stop({
        graph: 'one-plus-one',
      });
    });
  });
  describe('when creating graph with exported ports', () => {
    const signals = [];
    it('should be possible to send a graph', () => {
      const graph = new fbpGraph('exported-plus-one');
      graph.addNode('repeat', 'core/Repeat');
      graph.addNode('plus', 'foo/PlusOne');
      graph.addEdge('repeat', 'out', 'plus', 'val');
      graph.addInport('in', 'repeat', 'in');
      graph.addOutport('out', 'plus', 'out');
      graph.addOutport('error', 'plus', 'error');
      return client.protocol.graph.send(graph, true);
    });
    it('starting the graph should expose its ports', (done) => {
      const onSignal = (signal) => {
        signals.push(signal);
        if (signal.protocol === 'runtime' && signal.command === 'ports' && signal.payload.graph === 'exported-plus-one') {
          client.removeListener('signal', onSignal);
          done();
        }
      };
      client.on('signal', onSignal);
      client.protocol.network.start({
        graph: 'exported-plus-one',
      })
        .catch((err) => {
          client.removeListener('signal', onSignal);
          done(err);
        });
    });
    it('should be possible to send a packet', (done) => {
      const onSignal = (signal) => {
        signals.push(signal);
        if (signal.protocol === 'runtime' && signal.command === 'packet') {
          client.removeListener('signal', onSignal);
          done();
        }
      };
      client.on('signal', onSignal);
      client.protocol.runtime.packet({
        graph: 'exported-plus-one',
        event: 'data',
        port: 'in',
        payload: 1,
      })
        .catch((err) => {
          client.removeListener('signal', onSignal);
          done(err);
        });
    });
    it('should have resulted in an output packet', () => {
      const packets = signals.filter(s => (s.protocol === 'runtime' && s.command === 'packet'));
      expect(packets.length).to.equal(1);
      expect(packets[0].payload.port).to.equal('out');
      expect(packets[0].payload.payload).to.equal(2);
    });
    it('it should be possible to stop the network', () => {
      return client.protocol.network.stop({
        graph: 'exported-plus-one',
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

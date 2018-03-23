const { EventEmitter } = require('events');
const { Server: HttpServer } = require('http');
const { server: WebSocketServer } = require('websocket');
const { expect } = require('chai');
const fbpClient = require('../lib/client');

class DummyRuntime extends EventEmitter {
  constructor(httpServer) {
    super();
    this.connections = [];
    this.server = new WebSocketServer({
      httpServer,
    });
    this.subscribe();
  }

  subscribe() {
    this.server.on('request', (req) => {
      const connection = req.accept(null, req.origin);
      this.connections.push(connection);
      connection.on('message', (message) => {
        this.handleMessage(message);
      });
      connection.on('close', () => {
        this.connections = this.connections.filter(conn => conn !== connection);
      });
    });
  }

  handleMessage(message) {
    if (message.type !== 'utf8') {
      return;
    }
    const msg = JSON.parse(message.utf8Data);
    this.emit('message', msg);
  }

  send(protocol, command, payload) {
    const msg = JSON.stringify({
      protocol,
      command,
      payload,
    });
    this.connections.forEach((conn) => {
      conn.sendUTF(msg);
    });
  }

  close() {
    this.connections.forEach((conn) => conn.close());
  }
}

describe('FBP Client with dummy runtime', () => {
  let server = null;
  let runtime = null;
  before((done) => {
    server = new HttpServer();
    runtime = new DummyRuntime(server);
    server.listen(3671, done);
  });
  after((done) => {
    if (!server) {
      done();
      return;
    }
    server.close(done);
  });
  describe('without a runtime response', () => {
    it('should fail to connect', () => {
      return fbpClient({
        address: 'ws://localhost:3671',
        secret: '',
      })
        .then((c) => c.connect())
        .then(() => { throw new Error('Unexpected success') })
        .catch((err) => {
          expect(err).to.be.an('error');
          expect(err.message).to.contain('timed out');
        });
    });
  });
  describe('with invalid runtime payload', () => {
    it('should fail to connect', () => {
      runtime.once('message', (msg) => {
        if (msg.protocol === 'runtime' && msg.command === 'getruntime') {
          runtime.send('runtime', 'runtime', {
            type: 'foo',
            version: '0.4',
            baz: 'bar',
          });
        }
      });
      return fbpClient({
        address: 'ws://localhost:3671',
        secret: '',
      })
        .then((c) => c.connect())
        .then(() => { throw new Error('Unexpected success') })
        .catch((err) => {
          expect(err).to.be.an('error');
          expect(err.message).to.contain('invalid payload for runtime:runtime');
        });
    });
  });
  describe('with valid 0.6 runtime and full capabilities', () => {
    let client = null;
    it('should be able to connect', () => {
      runtime.once('message', (msg) => {
        if (msg.protocol === 'runtime' && msg.command === 'getruntime') {
          runtime.send('runtime', 'runtime', {
            type: 'foo',
            version: '0.6',
            capabilities: [
              'protocol:component',
              'protocol:graph',
              'protocol:network',
              'protocol:runtime',
            ],
          });
        }
      });
      return fbpClient({
        address: 'ws://localhost:3671',
        secret: '',
      })
        .then((c) => {
          client = c;
          return c.connect();
        });
    });
    it('should fail observer on pre-existing protocol error payloads', () => {
      const observer = client.observe(['network:*']);
      runtime.send('network', 'data', {
        foo: 'bar',
      });
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve();
        }, 10);
      })
        .then(() => observer.until([], []))
        .then(() => { throw new Error('Unexpected success') })
        .catch((err) => {
          expect(err).to.be.an('error');
          expect(err.message).to.contain('invalid payload for network:data');
        });
    });
    it('should fail observer on newly-arriving protocol error payloads', () => {
      const observer = client.observe(['network:*']);
      setTimeout(() => {
        runtime.send('network', 'data', {
          foo: 'bar',
        });
      }, 10);
      return observer.until([], [])
        .then(() => { throw new Error('Unexpected success') })
        .catch((err) => {
          expect(err).to.be.an('error');
          expect(err.message).to.contain('invalid payload for network:data');
        });
    });
    it('should fail requests on protocol error responses', () => {
      runtime.once('message', () => {
        runtime.send('graph', 'clear', {});
      });
      return client.protocol.graph.clear({
        id: 'foo',
        name: 'Foo',
      })
        .then(() => { throw new Error('Unexpected success') })
        .catch((err) => {
          expect(err).to.be.an('error');
          expect(err.message).to.contain('invalid payload for graph:clear');
        });
    });
    it('should fail requests on timeout', () => {
      return client.protocol.graph.clear({
        id: 'foo',
        name: 'Foo',
      })
        .then(() => { throw new Error('Unexpected success') })
        .catch((err) => {
          expect(err).to.be.an('error');
          expect(err.message).to.contain('timed out');
        });
    });
    it('should succeed in sending packet without packetsent response', () => {
      return client.protocol.runtime.packet({
        graph: 'exported-plus-one',
        event: 'data',
        port: 'in',
        payload: 1,
      });
    });
    it('should be able to disconnect', () => {
      return client.disconnect();
    });
  });
});

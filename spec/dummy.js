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
  describe('with invalid runtime payload and skipValidation=true', () => {
    it('should be able to connect', () => {
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
      }, {
        skipValidation: true
      })
        .then((c) => c.connect().then(() => Promise.resolve(c)))
        .then((c) => c.disconnect())
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
  describe('with valid 0.7 runtime and limited capabilities', () => {
    let client = null;
    it('should be able to connect', () => {
      runtime.once('message', (msg) => {
        if (msg.protocol === 'runtime' && msg.command === 'getruntime') {
          runtime.send('runtime', 'runtime', {
            type: 'foo',
            version: '0.7',
            capabilities: [
              'protocol:graph',
              'network:control',
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
    it('should succeed in sending packet', () => {
      return client.protocol.runtime.packet({
        graph: 'exported-plus-one',
        event: 'data',
        port: 'in',
        payload: 1,
      })
        .then(() => { throw new Error('Unexpected success') })
        .catch((err) => {
          expect(err).to.be.an('error');
          expect(err.message).to.contain('Not permitted to send');
        });
    });
    it('should fail observer on pre-existing messages not covered by capability', () => {
      const observer = client.observe(['runtime:*']);
      runtime.send('runtime', 'packet', {
        graph: 'exported-plus-one',
        event: 'data',
        port: 'in',
        payload: 1,
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
          expect(err.message).to.contain('Not permitted to receive');
        });
    });
    it('should fail observer on newly-arriving messages not covered by capability', () => {
      const observer = client.observe(['runtime:*']);
      setTimeout(() => {
        runtime.send('runtime', 'packet', {
          graph: 'exported-plus-one',
          event: 'data',
          port: 'in',
          payload: 1,
        });
      }, 10);
      return observer.until([], [])
        .then(() => { throw new Error('Unexpected success') })
        .catch((err) => {
          expect(err).to.be.an('error');
          expect(err.message).to.contain('Not permitted to receive');
        });
    });
    it('should be able to disconnect', () => {
      return client.disconnect();
    });
  });
  describe('with valid 0.7 runtime and limited capabilities, skipPermissions=true', () => {
    let client = null;
    it('should be able to connect', () => {
      runtime.once('message', (msg) => {
        if (msg.protocol === 'runtime' && msg.command === 'getruntime') {
          runtime.send('runtime', 'runtime', {
            type: 'foo',
            version: '0.7',
            capabilities: [
              'protocol:graph',
              'network:control',
            ],
          });
        }
      });
      return fbpClient({
        address: 'ws://localhost:3671',
        secret: '',
      }, {
        skipPermissions: true,
        commandTimeout: 100,
      })
        .then((c) => {
          client = c;
          return c.connect();
        });
    });
    it('should succeed in sending packet', () => {
      runtime.once('message', (msg) => {
        if (msg.protocol === 'runtime' && msg.command === 'packet') {
          const packet = JSON.parse(JSON.stringify(msg.payload));
          delete packet.secret;
          runtime.send('runtime', 'packetsent', packet);
        }
      });
      return client.protocol.runtime.packet({
        graph: 'exported-plus-one',
        event: 'data',
        port: 'in',
        payload: 1,
      })
    });
    it('should time out if there is no packetsent', () => {
      return client.protocol.runtime.packet({
        graph: 'exported-plus-one',
        event: 'data',
        port: 'in',
        payload: 1,
      })
        .then(() => { throw new Error('Unexpected success') })
        .catch((err) => {
          expect(err).to.be.an('error');
          expect(err.message).to.contain('timed out');
        });
    });
    it('should fail observer on pre-existing messages not covered by capability', () => {
      const observer = client.observe(['runtime:*']);
      runtime.send('runtime', 'packet', {
        graph: 'exported-plus-one',
        event: 'data',
        port: 'in',
        payload: 1,
      });
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve();
        }, 10);
      })
        .then(() => observer.until(['runtime:packet'], []))
        .then((packets) => {
          expect(packets).to.be.an('array');
          expect(packets.length).to.equal(1);
        });
    });
    it('should fail observer on newly-arriving messages not covered by capability', () => {
      const observer = client.observe(['runtime:*']);
      setTimeout(() => {
        runtime.send('runtime', 'packet', {
          graph: 'exported-plus-one',
          event: 'data',
          port: 'in',
          payload: 1,
        });
      }, 10);
      return observer.until(['runtime:packet'], [])
        .then((packets) => {
          expect(packets).to.be.an('array');
          expect(packets.length).to.equal(1);
        });
    });
    it('should be able to disconnect', () => {
      return client.disconnect();
    });
  });
});

const fbpConnector = require('fbp-protocol-client');
const { EventEmitter } = require('events');
const { timedPromise, addressToProtocol } = require('./utils');
const validate = require('./validate')();

class FbpClient extends EventEmitter {
  constructor(definition, options) {
    super();
    this.definition = definition;
    const Runtime = fbpConnector.getTransport(definition.protocol);
    this.transport = new Runtime(this.definition);
    this.options = options;
    if (!this.options.connectionTimeout) {
      this.options.connectionTimeout = 1000;
    }
  }

  isConnected() {
    return this.transport.isConnected();
  }

  connect() {
    return timedPromise((resolve, reject) => {
      let onError = null;
      const onRuntime = (message) => {
        if (message.command !== 'runtime') {
          // Wait for another message
          this.transport.once('runtime', onRuntime);
          return;
        }
        this.transport.removeListener('error', onError);
        validate('/runtime/output/runtime', message)
          .then(() => {
            resolve(this.definition);
          }, (err) => {
            reject(err);
          });
      };
      onError = (err) => {
        this.transport.removeListener('runtime', onRuntime);
        reject(err);
      };
      this.transport.once('runtime', onRuntime);
      this.transport.once('error', onError);
      this.transport.connect();
    }, this.options.connectionTimeout, `Connection to ${this.definition.address} timed out`);
  }

  disconnect() {
    return new Promise((resolve) => {
      if (!this.isConnected()) {
        resolve(null);
        return;
      }
      this.transport.once('disconnected', () => {
        resolve(null);
      });
      this.transport.disconnect();
    });
  }
}


module.exports = (definition, options = {}) => new Promise((resolve, reject) => {
  validate('/definition/', definition)
    .then(() => {
      const connectionDef = definition;
      connectionDef.protocol = connectionDef.protocol || addressToProtocol(connectionDef.address);
      if (!connectionDef.protocol) {
        reject(new Error('Runtime connection protocol is required'));
        return;
      }
      if (!fbpConnector.transports[connectionDef.protocol]) {
        reject(new Error(`Unsupported FBP transport ${connectionDef.protocol}`));
        return;
      }
      resolve(new FbpClient(connectionDef, options));
    }, reject);
});

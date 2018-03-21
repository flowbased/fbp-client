const fbpConnector = require('fbp-protocol-client');
const { EventEmitter } = require('events');
const schemas = require('fbp-protocol/schema/schemas');
const { timedPromise, addressToProtocol } = require('./utils');
const validate = require('./validate')();
const adapter06 = require('./adapter/0_6');

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
    this.prepareCommands();
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
            this.prepareAdapter(message.payload.version);
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

  signal(message) {
    this.emit('message', message);
    this.emit(message.payload, {
      command: message.command,
      payload: message.payload,
    });
  }

  protocolError(err) {
    this.emit('protocolError', err);
  }

  prepareCommands() {
    this.protocol = {};
    Object.keys(schemas).forEach((protocol) => {
      if (!schemas[protocol].input) {
        return;
      }
      const commands = {};
      Object.keys(schemas[protocol].input).forEach((command) => {
        commands[command] = (payload) => {
          const withSecret = payload;
          withSecret.secret = this.definition.secret;
          // TODO: Check capabilities first
          return validate(`/${protocol}/${schemas[protocol].input[command].id}`, {
            protocol,
            command,
            payload: withSecret,
          })
            .then(() => {
              if (!this.adapter) {
                throw new Error('FBP client must be connected to the runtime before sending commands');
              }
              return this.adapter.send(protocol, command, withSecret);
            });
        };
      });
      this.protocol[protocol] = commands;
    });
  }

  prepareAdapter(version) {
    if (this.adapter) {
      return;
    }
    // TODO: Semver comparison?
    const versionNumber = Number.parseFloat(version);
    if (versionNumber <= 0.6) {
      this.adapter = adapter06(this);
      this.adapter.tick();
      return;
    }
    throw new Error(`Unsupported FBP protocol version ${version}`);
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

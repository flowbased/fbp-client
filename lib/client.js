const fbpConnector = require('fbp-protocol-client');
const { EventEmitter } = require('events');
const { timedPromise, addressToProtocol } = require('./utils');

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

  connect() {
    return timedPromise((resolve, reject) => {
      let onError = null;
      const onCapabilities = (capabilities) => {
        this.transport.removeListener('error', onError);
        this.definition.capabilities = capabilities;
        resolve(capabilities);
      };
      onError = (err) => {
        this.transport.removeListener('capabilities', onCapabilities);
        reject(err);
      };
      this.transport.once('capabilities', onCapabilities);
      this.transport.once('error', onError);
      this.transport.connect();
    }, this.options.connectionTimeout, `Connection to ${this.definition.address} timed out`);
  }
}


module.exports = (definition, options = {}) => new Promise((resolve, reject) => {
  const connectionDef = definition;
  if (!connectionDef.address) {
    reject(new Error('Runtime connection address is required'));
    return;
  }
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
});

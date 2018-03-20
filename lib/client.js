const fbpConnector = require('fbp-protocol-client');
const { EventEmitter } = require('events');
const { addressToProtocol } = require('./utils');

class FbpClient extends EventEmitter {
  constructor(definition, options) {
    super();
    this.definition = definition;
    this.transport = fbpConnector.getTransport(definition.protocol);
    this.options = options;
    if (!this.options.connectionTimeout) {
      this.options.connectionTimeout = 1000;
    }
  }

  connect() {
    return Promise.race([
      new Promise((resolve, reject) => {
        setTimeout(() => {
          reject(new Error(`Connection to ${this.definition.address} timed out`));
        }, this.connectionTimeout);
      }),
    ]);
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

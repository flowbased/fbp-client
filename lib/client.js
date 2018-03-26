const fbpConnector = require('fbp-protocol-client');
const { EventEmitter } = require('events');
const schemas = require('fbp-protocol/schema/schemas');
const { timedPromise, addressToProtocol } = require('./utils');
const { canSend, canReceive } = require('./permissions');
const validate = require('./validate')();
const observe = require('./observe');
const adapter0x = require('./adapter/0_x');

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
    if (!this.options.commandTimeout) {
      this.options.commandTimeout = 1000;
    }
    if (!this.options.skipPermissions) {
      this.options.skipPermissions = false;
    }
    this.prepareCommands();
  }

  isConnected() {
    return this.transport.isConnected();
  }

  connect() {
    return timedPromise((resolve, reject) => {
      if (this.isConnected()) {
        resolve(this.definition);
        return;
      }
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
            this.emit('connected', this.definition);
          }, (err) => {
            this.transport.disconnect();
            reject(err);
          });
      };
      onError = (err) => {
        this.transport.removeListener('runtime', onRuntime);
        this.transport.disconnect();
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
        this.emit('disconnected', this.definition);
      });
      this.transport.disconnect();
    });
  }

  observe(events) {
    return observe(this, events);
  }

  signal(message) {
    this.emit('signal', message);
    this.emit(message.protocol, {
      command: message.command,
      payload: message.payload,
    });
  }

  protocolError(err) {
    this.emit('protocolError', err);
  }

  canSend(protocol, command) {
    return new Promise((resolve, reject) => {
      if (this.options.skipPermissions) {
        resolve(null);
        return;
      }
      if (canSend(protocol, command, this.definition.capabilities)) {
        resolve(null);
        return;
      }
      reject(new Error(`Not permitted to send ${protocol}:${command} messages`));
    });
  }

  canReceive(protocol, command) {
    return new Promise((resolve, reject) => {
      if (this.options.skipPermissions) {
        resolve(null);
        return;
      }
      if (canReceive(protocol, command, this.definition.capabilities)) {
        resolve(null);
        return;
      }
      reject(new Error(`Not permitted to receive ${protocol}:${command} messages`));
    });
  }


  prepareCommands() {
    this.protocol = {};
    Object.keys(schemas).forEach((protocol) => {
      if (!schemas[protocol].input) {
        return;
      }
      const commands = {};
      Object.keys(schemas[protocol].input).forEach((command) => {
        commands[command] = (payload = {}) => {
          const withSecret = payload;
          withSecret.secret = this.definition.secret;
          return validate(`/${protocol}/${schemas[protocol].input[command].id}`, {
            protocol,
            command,
            payload: withSecret,
          })
            .then(() => new Promise((resolve, reject) => {
              if (!this.adapter) {
                reject(new Error('FBP client must be connected to the runtime before sending commands'));
              }
              resolve(null);
            }))
            .then(() => this.canSend(protocol, command))
            .then(() => this.adapter.send(protocol, command, withSecret));
        };
      });
      this.protocol[protocol] = commands;
    });

    // Register also higher-level convenience commands
    this.protocol.graph.send = (graphInstance, main = false) => {
      const graph = graphInstance.name || graphInstance.properties.id;
      const {
        properties,
        nodes,
        edges,
        initializers,
        inports,
        outports,
      } = graphInstance;

      return this.protocol.graph.clear({
        id: graph,
        name: graphInstance.name,
        main,
        library: properties.project || this.definition.namespace,
        icon: properties.icon || '',
        description: properties.description || '',
      })
        .then(() => Promise.all(nodes.map(node => this.protocol.graph.addnode({
          id: node.id,
          component: node.component,
          metadata: node.metadata,
          graph,
        }))))
        .then(() => Promise.all(edges.map(edge => this.protocol.graph.addedge({
          src: edge.from,
          tgt: edge.to,
          metadata: edge.metadata,
          graph,
        }))))
        .then(() => Promise.all(initializers.map(iip => this.protocol.graph.addinitial({
          src: iip.from,
          tgt: iip.to,
          metadata: iip.metadata,
          graph,
        }))))
        .then(() => Promise.all(Object.keys(inports).map(pub => this.protocol.graph.addinport({
          public: pub,
          node: inports[pub].process,
          port: inports[pub].port,
          graph,
        }))))
        .then(() => Promise.all(Object.keys(outports).map(pub => this.protocol.graph.addoutport({
          public: pub,
          node: outports[pub].process,
          port: outports[pub].port,
          graph,
        }))))
        .then(() => graphInstance);
    };
  }

  prepareAdapter(version) {
    if (this.adapter) {
      return;
    }
    // TODO: Semver comparison?
    const versionNumber = Number.parseFloat(version);
    if (versionNumber <= 0.9) {
      this.adapter = adapter0x(this, versionNumber);
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

const debugSignal = require('debug')('fbp-client:adapter:signal');
const debugRequest = require('debug')('fbp-client:adapter:request');
const debugResponse = require('debug')('fbp-client:adapter:response');

class Adapter {
  constructor(client, version) {
    this.client = client;
    this.commands = [];
    this.listener = null;
    this.version = version;
    this.subscribe();
    this.tick();
  }

  subscribe() {
    const onMessage = (message) => {
      if (this.listener) {
        // Give current command the first dibs on the message
        this.listener(message);
        return;
      }
      debugSignal(`${message.protocol}:${message.command}`);
      // If there is no listener, treat it as signal
      this.client.validate(`/${message.protocol}/output/${message.command}`, message)
        .then(() => this.client.canReceive(message.protocol, message.command))
        .then(() => this.client.signal(message), err => this.client.protocolError(err));
    };
    this.client.transport.on('message', onMessage);
    this.client.transport.on('status', ({ online }) => {
      if (!online) {
        return;
      }
      this.tick();
    });
  }

  send(protocol, command, payload) {
    return new Promise((resolve, reject) => {
      const isAcceptedResponse = (response) => {
        if (response.protocol !== protocol) {
          return false;
        }
        const expectedResponses = [];
        // Handle cases where response has different command
        switch (`${protocol}:${command}`) {
          case 'runtime:packet': {
            expectedResponses.push('packetsent');
            break;
          }
          case 'component:getsource': {
            expectedResponses.push('source');
            break;
          }
          case 'component:source': {
            expectedResponses.push('component');
            break;
          }
          case 'component:list': {
            expectedResponses.push('component');
            expectedResponses.push('componentsready');
            break;
          }
          case 'network:start': {
            expectedResponses.push('started');
            break;
          }
          case 'network:stop': {
            expectedResponses.push('stopped');
            break;
          }
          case 'network:getstatus': {
            expectedResponses.push('status');
            break;
          }
          default: {
            expectedResponses.push(command);
          }
        }
        expectedResponses.push('error');
        if (expectedResponses.indexOf(response.command) === -1) {
          return false;
        }
        return true;
      };

      // Placeholder for results in cases where we have to collect multiple messages
      const results = [];

      // How to run the command when its time comes
      const execute = () => {
        let timeout = null;
        this.listener = (message) => {
          this.client.validate(`/${message.protocol}/output/${message.command}`, message)
            .then(() => this.client.canReceive(message.protocol, message.command))
            .then(() => {
              if (!isAcceptedResponse(message)) {
                // Unrelated message, treat as signal
                debugSignal(`${message.protocol}:${message.command}`);
                this.client.signal(message);
                return;
              }
              // No need to wait for timeout
              if (timeout) {
                clearTimeout(timeout);
                timeout = null;
              }
              debugResponse(`${message.protocol}:${message.command} for request ${protocol}:${command}`);
              if (message.command === 'error') {
                const err = new Error(message.payload.message);
                err.stack = message.payload.stack;
                this.listener = null;
                reject(err);
                this.tick();
                return;
              }
              if (protocol === 'component' && command === 'list') {
                // For component listings, we collect results until componentsready
                if (message.command === 'componentsready') {
                  this.listener = null;
                  resolve(results);
                  this.tick();
                  return;
                }
                results.push(message.payload);
                return;
              }
              this.listener = null;
              resolve(message.payload);
              this.tick();
            }, (err) => {
              this.listener = null;
              reject(err);
              this.tick();
            });
        };
        debugRequest(`${protocol}:${command}`);
        this.client.transport.send(protocol, command, payload);

        if (protocol === 'component') {
          // Component protocol messages can do lots of I/O, set no timeout
          return;
        }

        if (protocol === 'runtime' && command === 'packet' && this.version <= 0.6) {
          // runtime:packetssent was added in 0.7. Before that there was no response
          // If there is no error inside a short time, we assume it succeeded
          timeout = setTimeout(() => {
            this.listener = null;
            resolve(payload);
            this.tick();
          }, 10);
          return;
        }

        // Deal with commands timing out
        timeout = setTimeout(() => {
          this.listener = null;
          reject(new Error(`${protocol}:${command} timed out`));
          this.tick();
        }, this.client.options.commandTimeout);
      };
      this.commands.push(execute);
      this.tick();
    });
  }

  tick() {
    if (!this.commands.length) {
      return;
    }
    if (!this.client.isConnected()) {
      return;
    }
    if (this.listener) {
      return;
    }
    const command = this.commands.shift();
    command();
  }
}

module.exports = (client, version) => new Adapter(client, version);

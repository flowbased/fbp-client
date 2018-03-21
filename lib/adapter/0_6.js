const validate = require('../validate')();

class Adapter {
  constructor(client) {
    this.client = client;
    this.commands = [];
    this.listener = null;
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
      // If there is no listener, treat it as signal
      validate(`/${message.protocol}/output/${message.command}`, message)
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
        this.listener = (message) => {
          validate(`/${message.protocol}/output/${message.command}`, message)
            .then(() => {
              if (!isAcceptedResponse(message)) {
                // Unrelated message, treat as signal
                this.client.signal(message);
                return;
              }
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
        this.client.transport.send(protocol, command, payload);
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

module.exports = client => new Adapter(client);

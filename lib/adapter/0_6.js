class Adapter {
  constructor(client) {
    this.client = client;
    this.commands = [];
    this.listener = null;
    this.subscribe();
  }

  subscribe() {
    const onMessage = protocol => ({ command, payload }) => {
      if (this.listener) {
        // Give current command the first dibs on the message
        this.listener({
          protocol,
          command,
          payload,
        });
        return;
      }
      // If there is no listener, treat it as signal
      this.client.signal({
        protocol,
        command,
        payload,
      });
    };
    Object.keys(this.client.protocol).forEach((protocol) => {
      this.client.transport.on(protocol, onMessage(protocol));
    });
  }

  send(protocol, command, payload) {
    return new Promise((resolve, reject) => {
      let successResponse = null;

      // Handle cases where response has different command
      switch (command) {
        case 'getsource': {
          successResponse = 'source';
          break;
        }
        case 'setsource': {
          successResponse = 'component';
          break;
        }
        default: {
          successResponse = command;
        }
      }

      const execute = () => {
        this.listener = (message) => {
          if (message.protocol !== protocol || (message.command !== successResponse && message.command !== 'error')) {
            // Unrelated message, treat as signal
            this.client.signal(message);
            return;
          }
          if (message.command === 'error') {
            reject(message.payload);
            this.listener = null;
            this.tick();
            return;
          }
          resolve(message.payload);
          this.listener = null;
          this.tick();
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

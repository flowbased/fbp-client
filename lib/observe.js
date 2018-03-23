function stringMatches(string, matcher) {
  if (matcher === '*') {
    return true;
  }
  return (string === matcher);
}

function signalMatches(signal, signatures) {
  const matched = signatures.filter((signature) => {
    const [protocol, command] = signature.split(':');
    return (stringMatches(signal.protocol, protocol) && stringMatches(signal.command, command));
  });
  if (matched.length > 0) {
    return true;
  }
  return false;
}

class Observer {
  constructor(client, events) {
    this.client = client;
    this.signals = [];
    this.listener = null;
    this.subscribe(events);
  }

  subscribe(events) {
    this.listener = (signal) => {
      if (!signalMatches(signal, events)) {
        return;
      }
      this.signals.push(signal);
    };
    this.client.on('signal', this.listener);
  }

  unsubscribe() {
    if (!this.listener) {
      return;
    }
    this.client.removeListener('signal', this.listener);
    this.listener = null;
  }

  until(successEvents, failureEvents) {
    return new Promise((resolve, reject) => {
      // Check signals received until now
      for (let i = 0; i < this.signals.length; i += 1) {
        const signal = this.signals[i];
        if (signalMatches(signal, failureEvents)) {
          // TODO: Convert to error
          reject(this.signals.slice(0, i + 1));
          this.unsubscribe();
          this.signals = [];
          return;
        }
        if (signalMatches(signal, successEvents)) {
          resolve(this.signals.slice(0, i + 1));
          this.unsubscribe();
          this.signals = [];
          return;
        }
      }

      // See if the signal arrives later
      const listener = (signal) => {
        if (signalMatches(signal, failureEvents)) {
          // TODO: Convert to error
          reject(this.signals.slice(0));
          this.unsubscribe();
          this.client.removeListener('signal', listener);
          this.signals = [];
          return;
        }
        if (signalMatches(signal, successEvents)) {
          resolve(this.signals.slice(0));
          this.unsubscribe();
          this.client.removeListener('signal', listener);
          this.signals = [];
        }
      };
      this.client.on('signal', listener);
    });
  }
}

module.exports = (client, events) => new Observer(client, events);

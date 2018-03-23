function stringMatches(string, matcher) {
  if (matcher === '*') {
    return true;
  }
  return (string === matcher);
}

function signalMatches(signal, signatures) {
  if (typeof signatures === 'function') {
    return signatures(signal);
  }
  const matched = signatures.filter((signature) => {
    const [protocol, command] = signature.split(':');
    return (stringMatches(signal.protocol, protocol) && stringMatches(signal.command, command));
  });
  if (matched.length > 0) {
    return true;
  }
  return false;
}

function signalToError(signal) {
  const signature = `${signal.protocol}:${signal.command}`;
  const errorMessage = signal.payload.error || `Unexpected ${signature} message`;
  const err = new Error(errorMessage);
  err.signature = signature;
  if (signal.payload.stack) {
    err.stack = signal.payload.stack;
  }
  return err;
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

  until(success, failure) {
    return new Promise((resolve, reject) => {
      // Check signals received until now
      for (let i = 0; i < this.signals.length; i += 1) {
        const signal = this.signals[i];
        if (signalMatches(signal, failure)) {
          const err = signalToError(signal);
          err.signals = this.signals.slice(0, i + 1);
          reject(err);
          this.unsubscribe();
          this.signals = [];
          return;
        }
        if (signalMatches(signal, success)) {
          resolve(this.signals.slice(0, i + 1));
          this.unsubscribe();
          this.signals = [];
          return;
        }
      }

      // See if the signal arrives later
      const listener = (signal) => {
        if (signalMatches(signal, failure)) {
          const err = signalToError(signal);
          err.signals = this.signals.slice(0);
          reject(err);
          this.unsubscribe();
          this.client.removeListener('signal', listener);
          this.signals = [];
          return;
        }
        if (signalMatches(signal, success)) {
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

const debugObserver = require('debug')('fbp-client:observer');
const debugObserverIgnored = require('debug')('fbp-client:observer:ignored');

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
        debugObserverIgnored(`${signal.protocol}:${signal.command}`);
        return;
      }
      debugObserver(`Observed ${signal.protocol}:${signal.command}`);
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
          debugObserver(`Failed with ${signal.protocol}:${signal.command}`);
          err.signals = this.signals.slice(0, i + 1);
          this.unsubscribe();
          this.signals = [];
          reject(err);
          return;
        }
        if (signalMatches(signal, success)) {
          debugObserver(`Succeeded with ${signal.protocol}:${signal.command}`);
          this.unsubscribe();
          this.signals = [];
          resolve(this.signals.slice(0, i + 1));
          return;
        }
      }

      // See if the signal arrives later
      const listener = (signal) => {
        if (signalMatches(signal, failure)) {
          debugObserver(`Failed with ${signal.protocol}:${signal.command}`);
          const err = signalToError(signal);
          err.signals = this.signals.slice(0);
          this.unsubscribe();
          this.client.removeListener('signal', listener);
          this.signals = [];
          reject(err);
          return;
        }
        if (signalMatches(signal, success)) {
          debugObserver(`Succeeded with ${signal.protocol}:${signal.command}`);
          const signals = this.signals.slice(0);
          this.unsubscribe();
          this.client.removeListener('signal', listener);
          this.signals = [];
          resolve(signals);
        }
      };
      this.client.on('signal', listener);
    });
  }
}

module.exports = (client, events) => new Observer(client, events);

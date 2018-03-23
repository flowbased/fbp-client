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
  let errorMessage = `Unexpected ${signature} message`;
  let errorStack = '';
  if (signature === 'runtime:packet' && signal.payload.payload && signal.payload.payload.message) {
    // Use the error message of the actual payload
    errorMessage = signal.payload.payload.message;
    errorStack = signal.payload.payload.stack;
  }
  if (signal.payload.error) {
    // *:error or network:processerror
    errorMessage = signal.payload.error;
    errorStack = signal.payload.stack;
  }
  const err = new Error(errorMessage);
  err.signature = signature;
  if (errorStack) {
    err.stack = errorStack;
  }
  if (signal.payload.payload && signal.payload.payload.stack) {
    err.stack = signal.payload.payload.stack;
  }
  return err;
}

class Observer {
  constructor(client, events) {
    this.client = client;
    this.signals = [];
    this.protocolErrors = [];
    this.listener = null;
    this.errorListener = null;
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
    this.errorListener = (err) => {
      this.protocolErrors.push(err);
    };
    this.client.on('signal', this.listener);
    this.client.on('protocolError', this.listener);
  }

  unsubscribe() {
    if (this.listener) {
      this.client.removeListener('signal', this.listener);
      this.listener = null;
    }
    if (this.errorListener) {
      this.client.removeListener('protocolError', this.errorListener);
      this.errorListener = null;
    }
  }

  until(success, failure) {
    return new Promise((resolve, reject) => {
      // Check if there were protocol errors. These should always fail
      if (this.protocolErrors.length) {
        const error = this.protocolErrors[0];
        debugObserver(`Failed with protocol error ${error.message}`);
        error.signals = this.signals.slice(0);
        this.unsubscribe();
        this.signals = [];
        reject(error);
        return;
      }

      // Check signals received until now for failure or success
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
          const signals = this.signals.slice(0, i + 1);
          this.unsubscribe();
          this.signals = [];
          resolve(signals);
          return;
        }
      }

      let errorListener = null;
      // See if the signal arrives later
      const listener = (signal) => {
        if (signalMatches(signal, failure)) {
          debugObserver(`Failed with ${signal.protocol}:${signal.command}`);
          const err = signalToError(signal);
          err.signals = this.signals.slice(0);
          this.unsubscribe();
          this.client.removeListener('signal', listener);
          this.client.removeListener('protocolError', errorListener);
          this.signals = [];
          reject(err);
          return;
        }
        if (signalMatches(signal, success)) {
          debugObserver(`Succeeded with ${signal.protocol}:${signal.command}`);
          const signals = this.signals.slice(0);
          this.unsubscribe();
          this.client.removeListener('signal', listener);
          this.client.removeListener('protocolError', errorListener);
          this.signals = [];
          resolve(signals);
        }
      };
      // See if a protocol error arrives later
      errorListener = (err) => {
        debugObserver(`Failed with protocol error ${err.message}`);
        const error = err;
        error.signals = this.signals.slice(0);
        this.unsubscribe();
        this.client.removeListener('signal', listener);
        this.client.removeListener('protocolError', errorListener);
        this.signals = [];
      };
      this.client.on('signal', listener);
      this.client.on('protocolError', errorListener);
    });
  }
}

module.exports = (client, events) => new Observer(client, events);

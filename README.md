fbp-client [![Build Status](https://travis-ci.org/flowbased/fbp-client.svg?branch=master)](https://travis-ci.org/flowbased/fbp-client) [![Coverage Status](https://coveralls.io/repos/github/flowbased/fbp-client/badge.svg?branch=master)](https://coveralls.io/github/flowbased/fbp-client?branch=master)
==========

This library provides a higher level client for interacting with [FBP Protocol](http://flowbased.github.io/fbp-protocol/) runtimes. Underneath it utilizes the transport abstractions provided by [fbp-protocol-client](https://github.com/flowbased/fbp-protocol-client).

## Features

* Fully Promise-based API for interacting with the runtime
* Responses to requests sent to runtime are handled via Promise resolving or rejection
* Messages unrelated to current requests are provided via signal events
* Protocol API is autogenerated from FBP Protocol JSON schemas, ensuring that it changes up to date with protocol features
* All messages to and from runtime are validated against FBP Protocol specification

## Installation

Install this library via NPM:

```shell
$ npm install fbp-client --save
```

Please note that this library is shipped as ES6 code and utilizes native JavaScript Promises. If needed, you can install a Promise polyfill and transpile the code to ES5.

## Usage

Create a client instance for a FBP Protocol runtime definition with:

```javascript
const fbpClient = require('fbp-client');

fbpClient({
  address: 'wss://localhost:3569',
  protocol: 'websocket',
  secret: 'keyboard-cat',
})
  .then((client) => {
    // Use this client instance for further interactions
  });
```

Connect to runtime:

```javascript
client.connect()
  .then(() => {
    // Connected to runtime
  });
```

Send protocol messages:

```javascript
client.protocol.runtime.packet({
  graph: 'some-graph-id',
  port: 'in',
  event: 'data',
  payload: 'Hello World!',
})
  .then(() => {
    // Packet was sent
  });
```

## Signals

Events coming from the runtime that are not direct responses to requests made by user are considered to be "signals". To subscribe to all signals coming from the client, use:

```javascript
client.on('signal', signal => console.log(signal));
```

You can also subscribe to signals for only one particular subprotocol with:

```javascript
// Only listen to network protocol
client.on('network', signal => console.log(signal));
```

Messages sent as responses to a request are not emitted as signals.

### Observers

It is also possible to work with signals in a promisifed way by using observers:

```javascript
// Register observer for all network events
const observer client.observe(['network:*']);
// Start the network
client.protocol.network.start({
  graph: 'my-graph',
})
  .then(() => {
    // Receive all network signals on stopped, or failure with errors
    return observer.until(['network:stopped'], ['network:error', 'network:processerror']);
  });
```

## Debugging

It is possible to see the internal workings of the library by setting the `DEBUG` environment variable to one or multiple of the following:

* `fbp-client:adapter:signal`: Signals received by the runtime
* `fbp-client:adapter:request`: Requests sent to the runtime
* `fbp-client:adapter:response`: Responses received by the runtime
* `fbp-client:observer`: Observer results
* `fbp-client:observer:ignored`: Signals ignored by an observer

## Changes

* 0.2.2 (2018-03-24)
  - Fixed observer `until` failure handling on protocol validation errors
  - Improved test coverage
* 0.2.1 (2018-03-23)
  - Observer `until` also fails on protocol validation errors
  - Clearer observer error messages on error packets
* 0.2.0 (2018-03-23)
  - Added support for promisified signal observation
  - Added debugging support via the [debug](https://www.npmjs.com/package/debug) module
* 0.1.0 (2018-03-22)
  - Initial version, support for FBP Protocol version 0.7 and earlier

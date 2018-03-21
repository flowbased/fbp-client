const { parse: parseUrl } = require('url');

exports.addressToProtocol = (address) => {
  const parsed = parseUrl(address);
  switch (parsed.protocol) {
    case 'ws:':
    case 'wss:': {
      return 'websocket';
    }
    case 'http:':
    case 'https:': {
      if (parsed.query && parsed.query.indexOf('fbp_protocol=webrtc') !== -1) {
        return 'webrtc';
      }
      return 'iframe';
    }
    default: {
      return null;
    }
  }
};

exports.timedPromise = (callback, timeout, message = 'Request timed out') => Promise.race([
  new Promise(callback),
  new Promise((resolve, reject) => {
    setTimeout(() => {
      reject(new Error(message));
    }, timeout);
  }),
]);

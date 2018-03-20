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
      if (parsed.hash && parsed.hash.indexOf('fbp_protocol=webrtc') !== -1) {
        return 'webrtc';
      }
      return 'iframe';
    }
    default: {
      return null;
    }
  }
};

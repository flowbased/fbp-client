const { expect } = require('chai');
const utils = require('../lib/utils');

describe('FBP Client utils', () => {
  describe('converting address to protocol', () => {
    it('should detect https as iframe', () => {
      expect(utils.addressToProtocol('https://noflojs.org')).to.equal('iframe');
    });
    it('should detect explicit iframe param as iframe', () => {
      expect(utils.addressToProtocol('https://noflojs.org/noflo-browser/everything.html?fbp_noload=true&fbp_protocol=iframe')).to.equal('iframe');
    });
    it('should detect explicit webrtc param as iframe', () => {
      expect(utils.addressToProtocol('https://noflojs.org/noflo-browser/everything.html?fbp_noload=true&fbp_protocol=webrtc')).to.equal('webrtc');
    });
    it('should detect ws as websocket', () => {
      expect(utils.addressToProtocol('ws://localhost:3569')).to.equal('websocket');
    });
  });
});

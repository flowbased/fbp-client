const { expect } = require('chai');
const { canSend, canReceive } = require('../lib/permissions');

describe('FBP Protocol permission checking', () => {
  describe('checking input permissions', () => {
    it('should always allow getruntime', () => {
      expect(canSend('runtime', 'getruntime', [])).to.equal(true);
    });
    it('should not allow network start on empty permissions', () => {
      expect(canSend('network', 'start', [])).to.equal(false);
    });
    it('should not allow network start on network:status', () => {
      expect(canSend('network', 'start', ['network:status'])).to.equal(false);
    });
    it('should allow network start on protocol:network', () => {
      expect(canSend('network', 'start', ['protocol:network'])).to.equal(true);
    });
    it('should allow network start on network:control', () => {
      expect(canSend('network', 'start', ['network:control'])).to.equal(true);
    });
  });
  describe('checking output permissions', () => {
    it('should always allow runtime', () => {
      expect(canReceive('runtime', 'runtime', [])).to.equal(true);
    });
    it('should not allow network:started on empty permissions', () => {
      expect(canReceive('network', 'started', [])).to.equal(false);
    });
    it('should allow network:started on protocol:network', () => {
      expect(canReceive('network', 'started', ['protocol:network'])).to.equal(true);
    });
    it('should allow network:started on network:control', () => {
      expect(canReceive('network', 'started', ['network:control'])).to.equal(true);
    });
    it('should allow network:started on network:status', () => {
      expect(canReceive('network', 'started', ['network:status'])).to.equal(true);
    });
    it('should allow network:started on component:getsource', () => {
      expect(canReceive('network', 'started', ['component:getsource'])).to.equal(false);
    });
    it('should not allow graph:clear on empty permissions', () => {
      expect(canReceive('graph', 'clear', [])).to.equal(false);
    });
    it('should allow graph:clear on protocol:graph', () => {
      expect(canReceive('graph', 'clear', ['protocol:graph'])).to.equal(true);
    });
    it('should allow graph:clear on graph:readonly', () => {
      expect(canReceive('graph', 'clear', ['graph:readonly'])).to.equal(true);
    });
  });
});

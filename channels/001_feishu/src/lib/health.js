import { describeInstance } from './instance-identity.js';

export function buildHealthReport({ appId = '', hostname, connectionMode = '' } = {}) {
  const instance = describeInstance({ appId, hostname });
  const mode = ['websocket', 'webhook'].includes(connectionMode) ? connectionMode : 'websocket';
  return {
    status: 'ok',
    identity: {
      app: instance.app,
      host: instance.host,
      mode,
    },
  };
}

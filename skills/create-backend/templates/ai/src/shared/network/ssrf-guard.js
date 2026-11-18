import { lookup } from 'dns/promises';
import net from 'net';
import config from '../../config/index.js';

const BLOCKED_V4 = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['224.0.0.0', 4],
];

const blockList = new net.BlockList();
BLOCKED_V4.forEach(([address, prefix]) => blockList.addSubnet(address, prefix, 'ipv4'));
blockList.addAddress('::1', 'ipv6');
blockList.addSubnet('fc00::', 7, 'ipv6');
blockList.addSubnet('fe80::', 10, 'ipv6');

const rejected = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const assertPublicUrl = async (rawUrl) => {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw rejected('Enter a valid URL');
  }
  if (config.ai.allowPrivateHosts) {
    return url;
  }
  if (url.protocol !== 'https:') {
    throw rejected('The URL must use https');
  }
  const addresses = await lookup(url.hostname, { all: true }).catch(() => []);
  if (addresses.length === 0) {
    throw rejected('That host could not be resolved');
  }
  const blocked = addresses.find(({ address, family }) =>
    blockList.check(address, family === 6 ? 'ipv6' : 'ipv4'));
  if (blocked) {
    throw rejected('That host is not allowed');
  }
  return url;
};

export { assertPublicUrl };

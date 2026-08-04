import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SAFE_ID = /^[A-Za-z0-9@._:-]{1,256}$/;

type ExecutorResult = { stdout: string; stderr: string };
type Executor = (file: string, args: string[]) => Promise<ExecutorResult>;

export type ParsedWeixinEndpoint = {
  userId: string;
  account?: string;
  msg?: string;
};

function validateId(value: string): string {
  if (!SAFE_ID.test(value)) throw new Error('invalid_weixin_endpoint');
  return value;
}

export function buildWeixinEndpoint(
  userId: string,
  options: { accountId: string; messageId: string },
): string {
  return `${validateId(userId)}|account:${validateId(options.accountId)}|msg:${validateId(options.messageId)}`;
}

export function parseWeixinEndpoint(endpoint: string): ParsedWeixinEndpoint {
  const [rawUserId, ...fields] = endpoint.split('|');
  const result: ParsedWeixinEndpoint = { userId: validateId(rawUserId) };
  for (const field of fields) {
    const separator = field.indexOf(':');
    if (separator < 1) throw new Error('invalid_weixin_endpoint');
    const key = field.slice(0, separator);
    const value = validateId(field.slice(separator + 1));
    if (key !== 'account' && key !== 'msg') throw new Error('invalid_weixin_endpoint');
    if (result[key] !== undefined) throw new Error('invalid_weixin_endpoint');
    result[key] = value;
  }
  return result;
}

export async function deliverToC4(params: {
  endpoint: string;
  messageId: string;
  content: string;
  executor?: Executor;
}): Promise<{ success: true; raw: unknown }> {
  validateId(params.messageId);
  const receive = path.join(os.homedir(), 'yos', '.claude', 'skills', 'comm-bridge', 'scripts', 'c4-receive.js');
  const args = [
    receive,
    '--channel', 'weixin',
    '--endpoint', params.endpoint,
    '--message-id', params.messageId,
    '--json',
    '--content', params.content,
  ];
  const executor = params.executor ?? (async (file, childArgs) => {
    const result = await execFileAsync(file, childArgs, {
      encoding: 'utf8',
      timeout: 35_000,
      maxBuffer: 1024 * 1024,
    });
    return { stdout: result.stdout, stderr: result.stderr };
  });
  const result = await executor(process.execPath, args);
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout.trim());
  } catch {
    throw new Error('c4_invalid_response');
  }
  if ((parsed as { ok?: boolean }).ok !== true) throw new Error('c4_delivery_rejected');
  return { success: true, raw: parsed };
}

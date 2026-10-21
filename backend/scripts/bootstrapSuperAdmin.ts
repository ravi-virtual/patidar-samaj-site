// One-time creation of the first Super Admin.
//
//   npm run bootstrap:superadmin                       (prompts for everything)
//   npm run bootstrap:superadmin -- --name "A B" --email a@b.org
//
// The password is always typed at a hidden prompt: it is never read from arguments or
// environment variables, so it cannot end up in shell history or process listings.
// The command refuses to run once any Super Admin exists.
import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import mongoose from 'mongoose';
import { config } from '../src/config/constants';
import { BootstrapError, createFirstSuperAdmin } from '../src/utils/bootstrapSuperAdmin';

const argValue = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : undefined;
};

const askVisible = async (question: string): Promise<string> => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
};

const askHidden = (question: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) {
      reject(new Error('This command must be run in an interactive terminal.'));
      return;
    }
    stdout.write(question);
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          stdin.setRawMode(false);
          stdout.write('\n');
          process.exit(130);
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on('data', onData);
  });

const run = async (): Promise<void> => {
  if (config.isProduction) console.log('Running against the PRODUCTION configuration.');

  const name = argValue('--name') ?? (await askVisible('Full name: '));
  const email = argValue('--email') ?? (await askVisible('Email: '));
  const password = await askHidden('Password (min 10 chars, letters and a number): ');
  const confirm = await askHidden('Confirm password: ');
  if (password !== confirm) throw new BootstrapError('Passwords do not match.');

  await mongoose.connect(config.mongo.uri, { serverSelectionTimeoutMS: config.mongo.serverSelectionTimeoutMs });
  const created = await createFirstSuperAdmin({ name, email, password });
  console.log(`\nSuper Admin created: ${created.email}`);
  console.log('Sign in at the admin panel, then create other staff from Users & roles.');
};

run()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (err: unknown) => {
    console.error(`\nFailed: ${err instanceof Error ? err.message : String(err)}`);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
  });

import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parse } = require('jsonc-parser');

const [inputPath, outputPath, publicAppUrl] = process.argv.slice(2);
if (!inputPath || !outputPath || !publicAppUrl) {
  throw new Error('Use: build-secondary-wrangler.mjs input output publicAppUrl');
}
const errors = [];
const config = parse(await readFile(inputPath, 'utf8'), errors, {
  allowTrailingComma: true,
  disallowComments: false,
});
if (errors.length > 0) throw new Error(`Invalid Wrangler JSONC: ${JSON.stringify(errors)}`);
config.account_id = 'aa0a32cd6c75f48ff223c0e3458139d7';
config.d1_databases[0].database_name = 'velora-production-cutover';
config.d1_databases[0].database_id = '96277fcd-13e6-4d2d-9e51-7722d9a88d60';
config.vars.PUBLIC_APP_URL = publicAppUrl;
config.vars.TELEGRAM_RECONCILIATION_ENABLED = 'false';
config.env.staging.d1_databases[0].database_id = '84da7308-35b6-4f02-9cef-2ab738853034';
config.env.staging.vars.PUBLIC_APP_URL = publicAppUrl.replace('velora-app.', 'velora-staging.');
config.env['telegram-test'].d1_databases[0].database_id = 'a64a57a7-dd0a-40c4-907a-532929512f26';
config.env['telegram-test'].vars.PUBLIC_APP_URL = publicAppUrl.replace(
  'velora-app.',
  'velora-telegram-test.',
);
await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

const environmentName = process.argv[2] || 'LENA_CHARACTER_BOT_TOKEN_CHECK';
const token = process.env[environmentName];
if (!token) throw new Error('Token is unavailable.');

const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
  signal: AbortSignal.timeout(20_000),
});
const payload = await response.json();
if (!response.ok || payload?.ok !== true || payload.result?.is_bot !== true) {
  process.exitCode = 1;
} else {
  process.stdout.write(
    JSON.stringify({ id: payload.result.id, username: payload.result.username }),
  );
}

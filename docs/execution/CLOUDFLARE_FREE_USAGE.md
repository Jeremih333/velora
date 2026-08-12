# Cloudflare Free usage check

Velora never changes the Cloudflare plan and never performs a purchase. The local guard is strictly
read-only and checks the whole Cloudflare account because Free allowances are shared by all Workers
and D1 databases in that account.

## One-time human setup

Create a narrowly scoped Cloudflare API token with **Account Analytics: Read** and **D1: Read** for
the Velora account. Do not paste it into a file, GitHub issue, command argument or chat. Set it only
for the current terminal session together with the account ID:

```powershell
$env:CLOUDFLARE_ACCOUNT_ID = Read-Host 'Cloudflare account ID'
$secure = Read-Host 'Read-only Cloudflare analytics token' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $env:CLOUDFLARE_ANALYTICS_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
pnpm cloudflare:usage
Remove-Item Env:CLOUDFLARE_ANALYTICS_TOKEN
Remove-Item Env:CLOUDFLARE_ACCOUNT_ID
```

Exit code `0` means below 70%, `1` means at least one metric reached 70%, and `2` means a metric
reached 85% or the check could not prove that the data was complete. A warning or failure requires a
human comparison with Cloudflare **Billing > Billable Usage** and the D1 database Metrics view.
Analytics must never be treated as permission to enable billing or upgrade the plan.

The thresholds use the reviewed Free allowances: 100,000 Worker requests/day, 5,000,000 D1 rows
read/day, 100,000 D1 rows written/day, 5 GB total D1 storage and 10 D1 databases. Update the constants
only after reviewing current official Cloudflare limits and updating the regression tests.

param(
  [string]$ReferenceDirectory = (Join-Path $PSScriptRoot '..\docs\ui\reference'),
  [string]$YamlOutput = (Join-Path $PSScriptRoot '..\docs\ui\SCREENSHOT_MANIFEST.yaml'),
  [string]$MarkdownOutput = (Join-Path $PSScriptRoot '..\docs\ui\SCREENSHOT_MANIFEST.md')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$screens = @(
  @('Discovery gallery', '/discover', 'default discovery feed', 'discover-default', 'character cards, search, tag filters, bottom navigation'),
  @('Create drawer', '/discover', 'creation drawer open', 'owner-with-content', 'drawer, create character, create persona, create lorebook'),
  @('Creative library drawer', '/discover', 'library drawer open', 'owner-with-content', 'drawer, characters, personas, lorebooks'),
  @('My characters', '/characters', 'owned character list', 'owner-with-characters', 'character cards, search, create action'),
  @('My lorebooks', '/lorebooks', 'owned lorebook list', 'owner-with-lorebooks', 'lorebook cards, search, create action'),
  @('Discovery sort menu', '/discover', 'sort menu open', 'discover-default', 'menu, selected sort, dismiss layer'),
  @('Character creator top', '/characters/new', 'editor top', 'character-draft', 'identity fields, avatar, save state'),
  @('Character creator middle', '/characters/new', 'editor middle', 'character-draft', 'description fields, tags, content rating'),
  @('Character creator bottom', '/characters/new', 'editor bottom', 'character-draft', 'greetings, examples, publish action'),
  @('Recent chats', '/chats', 'recent conversations', 'user-with-chats', 'chat cards, search, sort, archive'),
  @('User profile', '/settings/profile', 'profile overview', 'registered-user', 'avatar, account data, navigation rows'),
  @('Persona chooser', '/chat/:conversationId', 'persona chooser open', 'chat-with-personas', 'persona cards, selected state, confirm action'),
  @('Persona list', '/personas', 'owned persona list', 'owner-with-personas', 'persona cards, search, create action'),
  @('Persona editor top', '/personas/:id/edit', 'editor top', 'persona-draft', 'avatar, identity, description fields'),
  @('Persona editor bottom', '/personas/:id/edit', 'editor bottom', 'persona-draft', 'speaking style, notes, save action'),
  @('Main roleplay chat', '/chat/:conversationId', 'active branch', 'long-roleplay-chat', 'header, message timeline, composer, tools'),
  @('Quick model picker top', '/chat/:conversationId', 'model picker open top', 'free-user-chat', 'recommended model rows, selection, availability'),
  @('Quick model picker bottom', '/chat/:conversationId', 'model picker open lower', 'free-user-chat', 'premium rows, full catalog link, generation settings'),
  @('Full model catalog', '/models', 'catalog list', 'model-catalog', 'model rows, descriptions, availability, selection'),
  @('Reaction picker', '/chat/:conversationId', 'reaction popover open', 'chat-with-message', 'emoji strip, selected reaction, dismiss layer'),
  @('Assistant message menu', '/chat/:conversationId', 'assistant message menu open', 'chat-with-assistant-message', 'copy, regenerate, branch, report actions'),
  @('User message menu', '/chat/:conversationId', 'user message menu open', 'chat-with-user-message', 'edit, copy, delete, branch actions'),
  @('Character profile', '/characters/:id', 'public profile', 'published-character', 'hero media, metadata, description, start story'),
  @('Greeting collapsed', '/characters/:id', 'greeting collapsed', 'character-with-long-greeting', 'greeting preview, expand action'),
  @('Greeting expanded', '/characters/:id', 'greeting expanded', 'character-with-long-greeting', 'full greeting, collapse action'),
  @('Creator profile', '/creators/:id', 'public creator profile', 'creator-with-content', 'creator header, follow action, published content'),
  @('Manage chats', '/chats/manage', 'selection mode', 'user-with-chats', 'selection controls, archive, delete'),
  @('Chat sort menu', '/chats', 'sort menu open', 'user-with-chats', 'sort options, selected state, dismiss layer'),
  @('Tag filter base', '/discover', 'tag filter open', 'discover-default', 'search tags, selected chips, apply action'),
  @('Tag filter selected', '/discover', 'tag selected', 'discover-default', 'selected chip, result count, clear action'),
  @('Tag filter search', '/discover', 'tag query entered', 'discover-default', 'query, filtered tags, empty handling'),
  @('Tag filter groups', '/discover', 'tag groups expanded', 'discover-default', 'tag groups, disclosure controls'),
  @('Tag filter exclusions', '/discover', 'excluded tags selected', 'discover-default', 'include and exclude chips, validation'),
  @('Tag filter dense list', '/discover', 'dense tag list', 'discover-default', 'scrolling tag list, sticky actions'),
  @('Tag filter applied', '/discover', 'filter applied', 'filtered-discovery', 'active filter summary, reset action, results'),
  @('Language filter', '/discover', 'language filter open', 'discover-default', 'language choices, selection, clear action'),
  @('Group size filter', '/discover', 'group size filter open', 'discover-default', 'size choices, selection, clear action'),
  @('Pricing card one', '/pricing', 'monthly tier card', 'pricing-public', 'tier price, benefits, purchase action'),
  @('Pricing card two', '/pricing', 'monthly tier comparison', 'pricing-public', 'tier price, benefits, purchase action'),
  @('Pricing card three', '/pricing', 'higher tier card', 'pricing-public', 'tier price, benefits, purchase action'),
  @('Pricing card four', '/pricing', 'tier comparison lower', 'pricing-public', 'tier price, benefits, purchase action'),
  @('Pricing FAQ top', '/pricing', 'faq top', 'pricing-public', 'faq disclosures, legal links'),
  @('Pricing FAQ lower', '/pricing', 'faq lower', 'pricing-public', 'faq disclosures, restore purchase guidance'),
  @('Annual pricing one', '/pricing', 'annual period selected', 'pricing-public', 'period switch, tier price, savings'),
  @('Annual pricing two', '/pricing', 'annual tier details', 'pricing-public', 'tier benefits, limits, purchase action'),
  @('Fixed pricing variant', '/pricing', 'fixed period variant', 'pricing-public', 'fixed duration, price, non-renewal copy')
)

if ($screens.Count -ne 46) { throw "Internal screen catalog must contain exactly 46 entries." }
$referenceRoot = [IO.Path]::GetFullPath($ReferenceDirectory)
$yamlLines = [Collections.Generic.List[string]]::new()
$mdLines = [Collections.Generic.List[string]]::new()
$yamlLines.Add("version: 1")
$yamlLines.Add("reference_count: 46")
$yamlLines.Add("source_archive: 'user-provided ZIP; immutable controlled copy'")
$yamlLines.Add("source_archive_sha256: '6ca0030261f3f8041a0839d31bdf9d50ca64713deb164de3d0252d8576878fda'")
$yamlLines.Add("screenshots:")
$mdLines.Add('# Screenshot manifest')
$mdLines.Add('')
$mdLines.Add('Controlled copy of 46 user-provided visual references. Status is intentionally `NOT_VERIFIED` until a real browser run produces expected/actual/diff evidence.')
$mdLines.Add('')
$mdLines.Add('| ID | Reference | Viewport | Route/state | Fixture | Status |')
$mdLines.Add('| -- | --------- | -------- | ----------- | ------- | ------ |')

for ($index = 1; $index -le 46; $index++) {
  $fileName = 'photo_{0:D2}.jpg' -f $index
  $path = Join-Path $referenceRoot $fileName
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing reference: $fileName" }
  $image = [Drawing.Image]::FromFile($path)
  try {
    $width = $image.Width
    $height = $image.Height
  } finally {
    $image.Dispose()
  }
  $hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
  $screen = $screens[$index - 1]
  $title = $screen[0]
  $route = $screen[1]
  $state = $screen[2]
  $fixture = $screen[3]
  $components = $screen[4]
  $id = 'ui-{0:D2}' -f $index
  $yamlLines.Add("  - id: '$id'")
  $yamlLines.Add("    reference: 'docs/ui/reference/$fileName'")
  $yamlLines.Add("    source: '$fileName'")
  $yamlLines.Add("    normalized: 'docs/ui/reference/$fileName'")
  $yamlLines.Add("    sha256: '$hash'")
  $yamlLines.Add("    viewport: { width: $width, height: $height }")
  $yamlLines.Add("    route: '$route'")
  $yamlLines.Add("    state: '$state'")
  $yamlLines.Add("    fixture: '$fixture'")
  $yamlLines.Add("    preconditions: ['load fixture $fixture', 'authenticate only when the route requires it', 'reset route-local UI state']")
  $yamlLines.Add("    user_data: 'deterministic non-production fixture data'")
  $yamlLines.Add("    actions: ['open route', 'establish state', 'capture viewport']")
  $yamlLines.Add("    components: ['$($components.Replace("'", "''"))']")
  $yamlLines.Add("    requiredComponents: ['$($components.Replace("'", "''"))']")
  $yamlLines.Add("    requiredStrings: ['$($title.Replace("'", "''"))', 'localized primary actions for the state']")
  $yamlLines.Add("    requiredControls: ['all controls named by requiredComponents', 'explicit close or back control for overlays']")
  $yamlLines.Add("    business_rules: ['authorization is server-side', 'persistent actions survive reload', 'no secrets in frontend']")
  $yamlLines.Add("    expected: '$($title.Replace("'", "''")) with all controls visible and operational'")
  $yamlLines.Add("    expectedState: '$($title.Replace("'", "''")) with all controls visible, enabled according to policy, and backed by persisted domain state'")
  $yamlLines.Add("    visual_target: 'functional and visual parity adapted to the Velora design system'")
  $yamlLines.Add("    interactions: ['keyboard', 'pointer', 'touch where applicable', 'outside-click dismissal for overlays']")
  $yamlLines.Add("    accessibility: ['visible focus', 'semantic accessible names', 'no keyboard trap', 'reduced-motion safe']")
  $yamlLines.Add("    allowed_deviation: ['Velora brand copy', 'platform-safe typography', 'content-dependent wrapping']")
  $yamlLines.Add("    disallowed_deviation: ['missing control', 'overlap', 'clipping', 'broken action', 'temporary-only persistence']")
  $yamlLines.Add("    tests: ['unit/component: pending', 'playwright flow: pending', 'visual expected-actual-diff: pending']")
  $yamlLines.Add("    logicTests: ['unit/component contract', 'Worker and D1 integration where state is persistent']")
  $yamlLines.Add("    visualTest: 'expected/actual/diff evidence under docs/ui/evidence/$id'")
  $yamlLines.Add("    responsiveTests: ['iphone', 'android', 'desktop']")
  $yamlLines.Add("    status: 'NOT_VERIFIED'")
  $mdLines.Add("| $id | $fileName | ${width}x${height} | `$route` / $state | $fixture | NOT_VERIFIED |")
}

$utf8 = [Text.UTF8Encoding]::new($false)
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($YamlOutput))) | Out-Null
[IO.File]::WriteAllLines([IO.Path]::GetFullPath($YamlOutput), $yamlLines, $utf8)
[IO.File]::WriteAllLines([IO.Path]::GetFullPath($MarkdownOutput), $mdLines, $utf8)
Write-Host "Created UI manifest for 46 references."

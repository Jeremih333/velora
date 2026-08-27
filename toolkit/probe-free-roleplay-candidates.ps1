$ErrorActionPreference = 'Stop'
$scriptRoot = if ([string]::IsNullOrWhiteSpace($PSScriptRoot)) {
  Join-Path ([string](Get-Location)) 'toolkit'
} else {
  $PSScriptRoot
}
$projectRoot = & (Join-Path $scriptRoot 'assert-boundary.ps1')
. (Join-Path $scriptRoot 'velora-secret-store.ps1')
Set-Location -LiteralPath $projectRoot

$apiKey = Get-VeloraStoredSecret 'BOTHUB_API_KEY'
if ([string]::IsNullOrWhiteSpace($apiKey)) { throw 'BOTHUB_API_KEY is unavailable.' }

$endpoint = 'https://openai.bothub.chat/v1'
$headers = @{ Authorization = "Bearer $apiKey" }
$candidates = @('mistral-nemo', 'l3-lunaris-8b', 'ling-3.0-flash', 'mythomax-l2-13b')
$scenarios = @(
  @{
    id = 'voice-and-action'
    messages = @(
      @{ role = 'system'; content = 'Ты Алиса, дерзкая рыжая гитаристка. Отвечай по-русски от первого лица персонажа. Дай 2–3 абзаца, обязательно добавь естественное действие между одинарными звёздочками и продвинь сцену вперёд. Не объясняй правила.' },
      @{ role = 'user'; content = 'Я опоздал к костру и протянул тебе сломанную струну. Что ты сделаешь?' }
    )
  },
  @{
    id = 'character-trigger'
    messages = @(
      @{ role = 'system'; content = 'Ты Алиса Двачевская, вспыльчивая, живая и ироничная гитаристка. Обращение «ДваЧе» тебя явно злит. Отвечай по-русски в роли, с репликой, эмоцией, действием между одинарными звёздочками и новым сюжетным крючком. 2–3 абзаца.' },
      @{ role = 'user'; content = 'Эй, ДваЧе, сыграешь нам что-нибудь?' }
    )
  }
)

function Invoke-BotHubJson([string]$Uri, [string]$Method = 'Get', $Body = $null) {
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    try {
      $parameters = @{ Uri = $Uri; Headers = $headers; Method = $Method; TimeoutSec = 60 }
      if ($null -ne $Body) {
        $parameters.ContentType = 'application/json; charset=utf-8'
        $parameters.Body = $Body | ConvertTo-Json -Depth 8 -Compress
      }
      return Invoke-RestMethod @parameters
    }
    catch {
      if ($attempt -eq 3) { throw }
      Start-Sleep -Seconds $attempt
    }
  }
}

try {
  $catalog = Invoke-BotHubJson "$endpoint/models"
  $listed = @{}
  foreach ($entry in @($catalog.data)) { if ($entry.id) { $listed[[string]$entry.id] = $true } }
  $results = @()
  foreach ($model in $candidates) {
    $scenarioResults = @()
    foreach ($scenario in $scenarios) {
      $watch = [Diagnostics.Stopwatch]::StartNew()
      try {
        $response = Invoke-BotHubJson "$endpoint/chat/completions" 'Post' @{
          model = $model
          messages = $scenario.messages
          max_tokens = 320
          temperature = 0.75
          stream = $false
        }
        $watch.Stop()
        $content = [string]$response.choices[0].message.content
        $scenarioResults += [ordered]@{
          id = $scenario.id
          status = 200
          latencyMs = $watch.ElapsedMilliseconds
          finishReason = $response.choices[0].finish_reason
          promptTokens = $response.usage.prompt_tokens
          completionTokens = $response.usage.completion_tokens
          hasAction = [regex]::IsMatch($content, '\*[^*\r\n]{2,}\*')
          paragraphCount = @($content -split '(?:\r?\n){2,}' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }).Count
          characterCount = $content.Length
          excerpt = $content.Substring(0, [Math]::Min(280, $content.Length))
        }
      }
      catch {
        $watch.Stop()
        $scenarioResults += [ordered]@{
          id = $scenario.id
          status = 0
          latencyMs = $watch.ElapsedMilliseconds
          error = $_.Exception.Message
        }
      }
    }
    $results += [ordered]@{
      model = $model
      listedForKey = $listed.ContainsKey($model)
      scenarios = $scenarioResults
    }
  }
  $report = [ordered]@{ checkedAt = [DateTimeOffset]::UtcNow.ToString('O'); results = $results }
  $output = Join-Path $projectRoot 'toolkit\free-roleplay-probe-results.json'
  [IO.File]::WriteAllText($output, ($report | ConvertTo-Json -Depth 10), [Text.UTF8Encoding]::new($false))
  Write-Host "Probe completed: $output"
}
finally {
  $apiKey = $null
  $headers = $null
}

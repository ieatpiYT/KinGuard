# Generates 3 realistic spoken .wav call recordings in python-backend/samples/
# using Windows built-in SpeechSynthesizer so you have instant fallback audio files
# in addition to any YouTube .mp3 / .wav clips you drop into samples/.

$samplesDir = Join-Path $PSScriptRoot "samples"
New-Item -ItemType Directory -Force -Path $samplesDir | Out-Null

Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = 0

$irsPath = Join-Path $samplesDir "irs_scam_call.wav"
$synth.SetOutputToWaveFile($irsPath)
$synth.Speak("Hello, this is Officer James Miller from the Internal Revenue Service Criminal Investigation Division. A federal arrest warrant has been issued under your name for unpaid tax fraud. Local county sheriff deputies will be dispatched to your residence within 30 minutes unless you wire an immediate settlement of two thousand dollars using Target gift cards.")

$bailPath = Join-Path $samplesDir "grandparent_bail_scam.wav"
$synth.SetOutputToWaveFile($bailPath)
$synth.Speak("Grandma, please help me! I was just in a car accident and the police arrested me. My lawyer says you need to send fifteen hundred dollars by wire transfer or Bitcoin right now for my bail, and please do not call Mom or Dad to check.")

$docPath = Join-Path $samplesDir "doctor_office_reminder.wav"
$synth.SetOutputToWaveFile($docPath)
$synth.Speak("Hi, this is Sarah calling from Doctor Patel's clinic at Saint Mary's Medical Center. I am calling to confirm your cardiology appointment for Tuesday at 2:30 PM. Please call our front desk if you need to reschedule.")

$synth.SetOutputToNull()
$synth.Dispose()

Write-Host "Created sample audio files in $samplesDir :" -ForegroundColor Green
Get-ChildItem $samplesDir


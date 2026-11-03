🛡️ KinGuard

Eric, Luke, Mukunth

Zero-UI scam call screening with a delegated caregiver network.

The vulnerable user never has to make the security decision. A trusted family member does.

!Android !Backend !Dashboard !LLM !Status

📖 Table of Contents
The Problem
The Solution
How It Works
Architecture
Decision Logic
Repository Layout
API Reference
Quick Start
Live Demo Script
Project Status
Known Limitations
Roadmap
Team
🚨 The Problem

Elder fraud is a growing problem, and many scams begin with an unsolicited phone call. Attackers use high-pressure social engineering, tech-support fraud, impersonation, and AI voice cloning ("grandparent scams") to pressure older adults into sending money or revealing sensitive information.

Existing tools like Truecaller, Hiya, and Google Call Screen help identify suspicious callers, but they have limitations:

Failure	Why it matters
Static database failure	Blocklists and caller verification systems provide useful signals, but they cannot reliably determine what a caller intends. Scammers can spoof numbers and use previously unseen numbers.
Cognitive overload	Live-transcript screeners can present a stressful manipulation attempt to the user and ask them to judge it in real time. This places the burden of security on the person being targeted.

The problem isn't just identifying scam calls. It's making sure vulnerable people don't have to make difficult security decisions while someone is actively manipulating them.

💡 The Solution

KinGuard removes the vulnerable user from the security decision-making process.

Unknown calls are screened before the phone rings. Calls classified as high-risk can be rejected, low-risk calls are allowed through, and ambiguous calls are silenced and sent to a caregiver dashboard for review.

A trusted family member can review flagged calls and choose to whitelist or block a number.

Persona	Experience
👵 Protected User	Minimal interaction after initial setup and permissions. Known and trusted callers can be allowed through, while suspicious calls are screened automatically.
🧑‍💻 Caregiver	A web-based "Mission Control" dashboard with flagged calls, AI-generated risk assessments, explanations, and Whitelist / Block actions.

MVP vs. Production Vision

Current MVP: Android call screening with cloud-assisted scam-risk analysis through a Flask backend and Groq LLM.
Production vision: Fully on-device inference, minimizing the transmission of call metadata and reducing dependence on network connectivity.
⚙️ How It Works
mermaid
sequenceDiagram
    autonumber
    participant Caller as 📞 Unknown Caller
    participant Phone as 📱 Android App (CallScreeningService)
    participant API as 🧠 Flask Backend
    participant LLM as ⚡ Groq LLM
    participant Dash as 🖥️ Caregiver Dashboard

    Caller->>Phone: Incoming call (before ringing)
    Phone->>API: POST /evaluate (number, verification status)

    API->>API: Check whitelist, blocklist, repeat-caller cache

    alt Whitelisted number
        API-->>Phone: allow
    else Blocked number
        API-->>Phone: reject
    else Repeat caller within 5 minutes
        API->>API: Apply repeat-caller prioritization
    else New caller
        API->>LLM: Score scam risk (2s timeout)
        LLM-->>API: Risk score + explanation

        alt Risk score above 90%
            API-->>Phone: reject
        else Risk score below 50%
            API-->>Phone: allow
        else Risk score between 50% and 90%
            API-->>Phone: silence
            API-)Dash: Log flagged call (background thread)
        end
    end

    Phone->>Phone: Apply screening response within Android's deadline

    Dash->>API: Caregiver clicks Whitelist or Block (POST /resolve)

    Note over Phone,Dash: Caregiver decisions update the backend's trusted and blocked number lists.


Note: The current MVP analyzes call metadata, not live call audio. Android's CallScreeningService provides call information and screening controls, but does not provide direct access to the caller's live audio.

🏗️ Architecture

KinGuard consists of three decoupled services in one monorepo, connected through an ngrok tunnel so a real phone or emulator can reach the laptop-hosted backend.

mermaid
flowchart LR
    subgraph EDGE["📱 Android Edge (android-app/)"]
        direction TB
        A1["CallScreeningService<br/>onScreenCall()"]
        A2["OkHttp client"]
        A1 --> A2
    end

    subgraph CORE["🧠 Decision Engine (python-backend/)"]
        direction TB
        B1["Flask API<br/>port 5001"]
        B2["Whitelist / Blocklist"]
        B3["5-min repeat-caller cache"]
        B4["Groq LLM<br/>gpt-oss-20b"]
        B5["Rule-based fallback"]
        B6[("In-memory<br/>flagged queue")]

        B1 --> B2 --> B3 --> B4
        B4 -. "LLM error or timeout" .-> B5
        B1 --> B6
    end

    subgraph CARE["🖥️ Mission Control (react-dashboard/)"]
        direction TB
        C1["React + Vite UI"]
        C2["Flagged call queue"]
        C3["Whitelist / Block buttons"]
        C1 --> C2
        C1 --> C3
    end

    EDGE == "HTTPS via ngrok<br/>POST /evaluate" ==> CORE
    CORE -- "GET /flagged-calls<br/>Polling" --> CARE
    CARE -- "POST /resolve" --> CORE

    classDef edge fill:#e8f5e9,stroke:#2e7d32,color:#1b5e20
    classDef core fill:#e3f2fd,stroke:#1565c0,color:#0d47a1
    classDef care fill:#fff3e0,stroke:#ef6c00,color:#e65100

    class A1,A2 edge
    class B1,B2,B3,B4,B5,B6 core
    class C1,C2,C3 care

Components

1. Android Application

Kotlin-based Android application.
Uses CallScreeningService to evaluate incoming calls before they ring.
Uses OkHttp to communicate with the backend.
Applies the screening decision returned by the API.

2. Python Backend

Flask API running on port 5001.
Checks caregiver whitelist and blocklist decisions.
Maintains a five-minute repeat-caller cache.
Uses Groq LLM for scam-risk assessment.
Uses a rule-based fallback when LLM analysis fails.
Maintains an in-memory queue of flagged calls.

3. Caregiver Dashboard

React + Vite frontend.
Displays flagged calls and their risk assessments.
Allows caregivers to whitelist or block numbers.
Polls the backend for pending flagged calls.
🧭 Decision Logic

Every unknown incoming call goes through a decision pipeline. Deterministic checks run before the LLM to reduce unnecessary model requests.

mermaid
flowchart TD
    START(["📞 POST /evaluate"]) --> WL{"Whitelisted<br/>by caregiver?"}

    WL -- yes --> ALLOW1["✅ allow"]
    WL -- no --> BL{"Blocked<br/>by caregiver?"}

    BL -- yes --> REJECT1["🚫 reject"]
    BL -- no --> REP{"Same number called<br/>within 5 minutes?"}

    REP -- yes --> PRIORITY["Repeat-caller<br/>prioritization"]
    REP -- no --> LLM["⚡ Groq LLM<br/>2s timeout"]

    PRIORITY --> LLM

    LLM -- "success" --> SCORE{"Scam risk score"}
    LLM -- "failure or timeout" --> RULES["🛟 Rule-based fallback"]

    RULES --> SCORE2{"Score at or<br/>above 0.5?"}

    SCORE2 -- yes --> SILENCE
    SCORE2 -- no --> ALLOW3["✅ allow"]

    SCORE -- "over 0.90" --> REJECT2["🚫 reject"]
    SCORE -- "0.50 to 0.90" --> SILENCE["🔕 silence"]
    SCORE -- "under 0.50" --> ALLOW4["✅ allow"]

    SILENCE --> LOG[("📋 Add to caregiver<br/>flagged queue")]

    classDef good fill:#e8f5e9,stroke:#2e7d32,color:#1b5e20
    classDef bad fill:#ffebee,stroke:#c62828,color:#b71c1c
    classDef warn fill:#fff8e1,stroke:#f9a825,color:#6d4c00

    class ALLOW1,ALLOW3,ALLOW4 good
    class REJECT1,REJECT2 bad
    class SILENCE,LOG warn

Risk thresholds
Risk score	Action	Android behavior
Above 0.90	reject	Rejects the incoming call
0.50 – 0.90	silence	Suppresses ringing; call remains subject to normal Android dialer and carrier behavior
Below 0.50	allow	Allows normal incoming call behavior

Important: The risk score is a model-generated estimate, not a statistically calibrated probability that a call is fraudulent.

Safety rails
⏱️ Fast: The LLM request has an approximately two-second timeout. Android call screening has a limited response window, so the overall request must also be bounded.
🛟 Fallback: If LLM analysis fails or times out, the backend uses a rule-based fallback instead of relying on the model.
👨‍👩‍👧 Human override: Caregivers can whitelist legitimate numbers, such as doctors or family members.
🔁 Repeat-caller handling: Repeat calls are treated as an urgency signal, not proof that a caller is trustworthy. They should not independently establish permanent trust.
⚖️ Risk-based screening: Calls are evaluated using available metadata and risk signals. AI classifications are not guaranteed to be correct.
📁 Repository Layout
text
Call-blocker/
├── android-app/        # Kotlin. CallScreeningService + OkHttp client
├── python-backend/     # Flask API, Groq integration, tests
│   ├── app.py
│   ├── requirements.txt
│   ├── .env.example
│   └── test_evaluate.py
├── react-dashboard/    # React + Vite + Tailwind caregiver UI
└── README.md

🔌 API Reference

Base URL:

text
http://localhost:5001


Or your ngrok tunnel:

text
https://<id>.ngrok-free.app

When calling through a free ngrok tunnel, send the header ngrok-skip-browser-warning: true on every request.
GET /health

Liveness check. Also reports whether the LLM key is loaded.

Example response

json
{
  "status": "ok",
  "llm_configured": true,
  "model": "openai/gpt-oss-20b"
}

POST /evaluate

Called by the Android app for each unknown incoming call.

Request

json
{
  "caller_id": "+15550198372",
  "verification_status": "FAILED",
  "call_direction": "INCOMING",
  "timestamp": 1761916800
}


Response 200

json
{
  "action": "silence",
  "confidence_score": 0.8,
  "reason": "Spoofed number, verification failed"
}

action	Android call result
reject	Requests call rejection
silence	Requests ringtone suppression
allow	Allows normal incoming call behavior

The backend returns a screening recommendation. Actual call behavior depends on Android's telecom framework and device implementation.

GET /flagged-calls

Returns calls awaiting caregiver review, newest first.

The dashboard polls this endpoint periodically.

Example response

json
[
  {
    "id": 1,
    "caller_id": "+15550198372",
    "confidence_score": 0.8,
    "reason": "Spoofed number, verification failed",
    "status": "pending",
    "timestamp": 1761916800
  }
]


Possible statuses:

pending
whitelisted
blocked

Dashboards should display only pending items.

confidence_score ranges from 0 to 1. Multiply by 100 to display a percentage.

POST /resolve

Caregiver decision from the dashboard.

Request

json
{
  "id": 1,
  "resolution": "whitelist"
}


resolution accepts:

"whitelist"
"block"

Use the backend's integer id as-is.

Returns:

200 on success.
400 for invalid input.
404 for an unknown ID.
🚀 Quick Start
Prerequisites
Python 3.9+
Node 18+ and npm (for the dashboard)
Android Studio (for the app and emulator)
A free Groq API key
A free ngrok account
1. Clone the repository
bash
git clone https://github.com/ieatpiYT/Call-blocker.git
cd Call-blocker

2. Start the backend
bash
cd python-backend

python3 -m venv venv
source venv/bin/activate

pip install -r requirements.txt

cp .env.example .env


Open .env and configure your API key:

env
GROQ_API_KEY=gsk_...


Never commit your .env file or expose your API key.

Start Flask:

bash
python app.py


Check that it works:

text
http://localhost:5001/health


You should see:

json
{
  "status": "ok",
  "llm_configured": true,
  "model": "openai/gpt-oss-20b"
}


macOS note: Port 5000 is commonly used by AirPlay Receiver, which is why the backend defaults to port 5001.

Quick test

bash
curl -X POST http://localhost:5001/evaluate \
  -H "Content-Type: application/json" \
  -d '{"caller_id":"+15550198372","verification_status":"FAILED","call_direction":"INCOMING","timestamp":1761916800}'


Run the test suite

bash
python test_evaluate.py

3. Expose the backend with ngrok

Open a separate terminal:

bash
ngrok config add-authtoken <your-token>


Then:

bash
ngrok http 5001


Copy the generated HTTPS URL.

For example:

text
https://example.ngrok-free.app


This is the backend base URL used by the Android app and dashboard.

Free ngrok URLs can change after restarting the tunnel, so update the application configuration when necessary.

4. Start the dashboard

Open another terminal:

bash
cd react-dashboard

npm install
npm run dev


Configure the dashboard to use your ngrok backend URL through its API URL setting.

5. Run the Android application
Open android-app/ in Android Studio.
Configure the backend base URL using your ngrok HTTPS URL.
Build and run the application on an emulator or supported Android device.
Grant the call-screening role when prompted.
Simulate calls using the emulator's Extended Controls → Phone panel.
🎬 Live Demo Script
Part	What we do	What you should see
1. Call interception	Simulate a call from an unlisted number (555-019-8372) in the emulator	If classified as ambiguous, the phone stays silent and a flagged-call card appears on the caregiver dashboard.
2. Repeat caller	Call again from the same number within five minutes	Demonstrate the backend's repeat-caller handling. Verify the actual decision returned by the implementation.
3. Caregiver override	Click Whitelist on the flagged card	The number is added to the trusted list and subsequent calls should follow the whitelist decision.
4. Block decision	Click Block on a flagged card	The number is added to the blocklist and subsequent calls should follow the block decision.
5. AI explanation	Show a flagged-call card	Explain the risk score and the reasoning returned by the backend.
Restart the backend between rehearsals if you want to reset its in-memory state, including the repeat-caller cache and flagged-call queue.

Demo tip: Prepare examples of a legitimate unknown caller, an ambiguous caller, and a high-risk caller. This demonstrates that KinGuard is not simply blocking every unfamiliar number.

📊 Project Status
Component	State
✅ Flask /evaluate with LLM scoring and rule-based fallback	Done
✅ 5-minute repeat-caller cache	Done
✅ /flagged-calls endpoint	Done
✅ /resolve endpoint	Done
✅ Automated backend tests	Done
🚧 Android CallScreeningService + networking	In progress
🚧 Dashboard wired to live backend (currently mock data)	In progress
📝 /analyze-audio demo endpoint	Planned
⚠️ Known Limitations

KinGuard is currently a hackathon MVP. The following limitations should be considered:

Cloud dependency: Scam-risk analysis currently uses a cloud-hosted Groq LLM. Fully on-device inference is a future goal.
Network dependency: Cloud-assisted screening requires backend connectivity. The backend has a rule-based fallback for LLM failures, but this does not eliminate network failure scenarios.
Model accuracy: AI-generated risk scores are estimates. False positives and false negatives are possible.
Android restrictions: Actual call-screening behavior depends on Android's telecom framework, the default dialer, device manufacturer, and carrier.
Call audio: The current implementation evaluates call metadata, not live caller audio.
Data persistence: The backend currently uses in-memory storage. Flagged calls, whitelist entries, blocklist entries, and cache state may be lost when the backend restarts.
Caregiver security: Production deployment requires authenticated caregiver accounts and access controls to protect call information and prevent unauthorized number-resolution actions.
Call-log behavior: Android restricts some call-log and notification controls. KinGuard does not guarantee that rejected calls will be completely hidden from system call history.

KinGuard is intended as an assistive fraud-prevention tool, not a guarantee that fraudulent calls will always be detected or blocked.

🗺️ Roadmap

The current hackathon MVP uses cloud-assisted metadata analysis. The long-term production vision is to move inference onto the device to reduce network dependency and minimize the transmission of sensitive call information.

mermaid
flowchart LR
    subgraph MVP["🏁 Hackathon MVP"]
        direction TB
        M1["CallScreeningService<br/>Pre-ring metadata screening"]
        M2["Flask + Groq LLM<br/>HTTPS backend"]
        M3["In-memory queue<br/>Polled caregiver dashboard"]
    end

    subgraph PROD["🏢 Production Vision"]
        direction TB
        P1["Call screening<br/>+ supported audio analysis"]
        P2["On-device edge AI<br/>LiteRT on Android"]
        P3["Secure caregiver service<br/>Encrypted alerts + model updates"]
    end

    M1 ==> P1
    M2 ==> P2
    M3 ==> P3

    classDef mvp fill:#fff3e0,stroke:#ef6c00,color:#e65100
    classDef prod fill:#e8eaf6,stroke:#3949ab,color:#1a237e

    class M1,M2,M3 mvp
    class P1,P2,P3 prod

Planned next steps
Persistent storage using SQLite or another database.
Authenticated caregiver accounts and per-user authorization.
Improved contact and trusted-number handling.
More comprehensive testing of false positives and false negatives.
Voicemail and live-audio analysis feasibility research.
On-device scam classification models for Android.
iOS support, subject to platform capabilities and restrictions.
Institutional trusted-number database for pharmacies, healthcare providers, and banks.
Secure data retention and deletion controls.
🔐 Privacy and Security Considerations

KinGuard processes telephone metadata to assess potential scam risk.

The current MVP sends call metadata, including caller information and verification status, to the Flask backend for evaluation. The backend may send relevant assessment information to the configured Groq model.

The current MVP is therefore not fully on-device and should not be described as a zero-data-transmission system.

Before production deployment, KinGuard needs:

Secure caregiver authentication.
Authorization checks for flagged-call access and number resolution.
Encrypted communication between services.
Appropriate retention and deletion policies.
Protection of phone numbers and other personal information.
Secure API key management.
Clear consent and privacy disclosures for protected users and caregivers.

The production goal is to minimize the amount of sensitive information transmitted or retained.

👥 Team
Name	Responsibility
Luke	android-app/ — Android call-screening service and network client
Eric	python-backend/ — Flask decision engine, LLM integration, and integration glue
Mukunth	react-dashboard/ — React caregiver Mission Control dashboard

<div align="center">

Built at a hackathon. Protecting the people who are hardest to protect.

KinGuard — Security decisions delegated to the people who care.

</div>

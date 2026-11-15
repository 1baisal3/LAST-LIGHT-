# LAST LIGHT

A website for the NASA hackathon: will a lunar lander survive 7 days (168 hours) at the South Pole — will there be enough light for the solar panels, battery charge, and communication with Earth? The user selects a landing site, date, and lander parameters → and gets a verdict, a timeline, and three explanations of "why.
Status: framework. Folders, file stubs, and rules are ready; the logic is marked with TODO. See ARCHITECTURE.md for how everything is structured. [**ARCHITECTURE.md**](ARCHITECTURE.md).

Structure
 
LAST-LIGHT/
├── Frontend/     Website: React + TypeScript + Vite        → frontend team
└── backend/      Server: Django + NASA data → backend team (code is uploaded by the backend developer)

Getting Started
 
Backend — instructions will appear in backend/README.md once the backend developer uploads the code.
 
Frontend (Node ≥ 22):
cd Frontend
npm install
npm run dev                       # http://localhost:5173

Where to look next

| I want to… | Read |
| --- | --- |
| understand how the parts connect | [ARCHITECTURE.md](ARCHITECTURE.md) |
| work on the frontend | [Frontend/README.md](Frontend/README.md) |
| work on the backend  | folder `backend/` (filled in by the backend developer) and [ARCHITECTURE.md](ARCHITECTURE.md) |
| learn branch and PR | [CONTRIBUTING.md](CONTRIBUTING.md) |
| see what's decided and what's pending  | [ARCHITECTURE.md, section 6–7](ARCHITECTURE.md#6-) |

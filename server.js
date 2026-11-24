// server.js - the SMI backend (Node.js + Express)
// It does 3 jobs: 1) shows the website, 2) saves players/teams/scores, 3) checks the admin login.

const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
app.use(express.json());                                      // lets us read JSON sent by the website
app.use((req, res, next) => { if (!req.body) req.body = {}; next(); });   // if nothing was sent, use an empty body
app.use(express.static(path.join(__dirname, "public")));      // shows the website (public/index.html)

// ---------- Settings ----------
const PORT = process.env.PORT || 3000;
const ADMIN_USER = (process.env.ADMIN_USER || "shinji ikari").toLowerCase();
const ADMIN_PASS = process.env.ADMIN_PASS || "misato97";
const DATA_FILE = path.join(__dirname, "data.json");          // all data is saved in this file

const sports = ["Cricket", "Football", "Basketball", "Table Tennis", "Badminton", "Volleyball", "Kabaddi"];

// ---------- Saving and loading data ----------
function demoData() {
    return {
        teams: [
            { id: 1, name: "Last Time Legends", sport: "Cricket",      played: 2, wins: 2, losses: 0 },
            { id: 2, name: "Super Strikers",    sport: "Cricket",      played: 2, wins: 0, losses: 2 },
            { id: 3, name: "Titans FC",         sport: "Football",     played: 2, wins: 1, losses: 1 },
            { id: 4, name: "Red Hawks",         sport: "Football",     played: 2, wins: 1, losses: 1 },
            { id: 5, name: "Court Kings",       sport: "Basketball",   played: 0, wins: 0, losses: 0 },
            { id: 6, name: "Hoop Dreams",       sport: "Basketball",   played: 0, wins: 0, losses: 0 },
            { id: 7, name: "Paddle Pros",       sport: "Table Tennis", played: 0, wins: 0, losses: 0 },
            { id: 8, name: "Spin Masters",      sport: "Table Tennis", played: 0, wins: 0, losses: 0 }
        ],
        players: []
    };
}

function readData() {
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify(demoData(), null, 2));   // first run: create demo data
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
}

function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function newId() {
    return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

// Makes any input a clean short text
function text(value) {
    return String(value || "").trim().slice(0, 60);
}

// ---------- Admin login ----------
const adminTokens = [];   // list of logged-in admin "tickets" (kept in memory)

// This runs before every admin-only route. No valid ticket = no entry.
function requireAdmin(req, res, next) {
    if (!adminTokens.includes(req.headers["x-token"])) {
        return res.status(401).json({ error: "Admin login required" });
    }
    next();
}

app.post("/api/login", (req, res) => {
    const user = text(req.body.username).toLowerCase();
    const pass = String(req.body.password || "");

    if (user === ADMIN_USER && pass === ADMIN_PASS) {
        const token = crypto.randomBytes(16).toString("hex");
        adminTokens.push(token);
        res.json({ token: token });
    } else {
        res.status(401).json({ error: "Wrong username or password!" });
    }
});

// ---------- Anyone can use these ----------
app.get("/api/data", (req, res) => {
    res.json(readData());
});

app.post("/api/players", (req, res) => {
    const name = text(req.body.name);
    const enroll = text(req.body.enroll);
    const sport = req.body.sport;
    const team = text(req.body.team);

    if (name === "" || enroll === "") {
        return res.status(400).json({ error: "Name and enrollment number are required." });
    }
    if (!sports.includes(sport)) {
        return res.status(400).json({ error: "Unknown sport." });
    }

    const data = readData();
    if (data.players.some(p => p.enroll.toLowerCase() === enroll.toLowerCase())) {
        return res.status(400).json({ error: "This enrollment number is already registered!" });
    }
    if (team !== "" && !data.teams.some(t => t.name === team && t.sport === sport)) {
        return res.status(400).json({ error: "That team does not exist for this sport." });
    }

    data.players.push({ id: newId(), name: name, enroll: enroll, sport: sport, team: team });
    writeData(data);
    res.json({ message: "Player registered" });
});

app.post("/api/teams", (req, res) => {
    const name = text(req.body.name);
    const sport = req.body.sport;

    if (name === "") {
        return res.status(400).json({ error: "Please enter a team name." });
    }
    if (!sports.includes(sport)) {
        return res.status(400).json({ error: "Unknown sport." });
    }

    const data = readData();
    if (data.teams.some(t => t.name.toLowerCase() === name.toLowerCase())) {
        return res.status(400).json({ error: "A team with this name already exists!" });
    }

    data.teams.push({ id: newId(), name: name, sport: sport, played: 0, wins: 0, losses: 0 });
    writeData(data);
    res.json({ message: "Team added" });
});

// ---------- Admin only ----------
app.delete("/api/players/:id", requireAdmin, (req, res) => {
    const data = readData();
    data.players = data.players.filter(p => p.id !== Number(req.params.id));
    writeData(data);
    res.json({ message: "Player removed" });
});

app.delete("/api/teams/:id", requireAdmin, (req, res) => {
    const data = readData();
    const team = data.teams.find(t => t.id === Number(req.params.id));
    if (!team) {
        return res.status(404).json({ error: "Team not found." });
    }

    // Players of this team become "no team"
    data.players.forEach(p => { if (p.team === team.name) p.team = ""; });
    data.teams = data.teams.filter(t => t.id !== team.id);
    writeData(data);
    res.json({ message: "Team deleted" });
});

app.post("/api/teams/:id/result", requireAdmin, (req, res) => {
    const data = readData();
    const team = data.teams.find(t => t.id === Number(req.params.id));
    if (!team) {
        return res.status(404).json({ error: "Team not found." });
    }
    if (req.body.result !== "win" && req.body.result !== "loss") {
        return res.status(400).json({ error: "Result must be win or loss." });
    }

    team.played += 1;
    if (req.body.result === "win") team.wins += 1;
    else team.losses += 1;
    writeData(data);
    res.json({ message: "Result saved" });
});

app.post("/api/reset", requireAdmin, (req, res) => {
    writeData(demoData());
    res.json({ message: "Demo data restored" });
});

// ---------- Start the server ----------
app.listen(PORT, () => {
    console.log("SMI server running on http://localhost:" + PORT);
});

const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const session = require("express-session");


const app = express();
const db = new sqlite3.Database("database.db");
app.use(express.json()); 

app.use(express.static("public"));
app.use(bodyParser.json());

app.use(session({
    secret: "secret123",
    resave: false,
    saveUninitialized: true
}));

// DB Tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        username TEXT,
        password TEXT,
        role TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY,
    hall TEXT,
    startDate TEXT,
    startTime TEXT,
    endDate TEXT,
    endTime TEXT,
    user TEXT,
    subject TEXT,
    mobile TEXT,
    status TEXT
)`);
});

// Dummy Admin
db.run(`INSERT OR IGNORE INTO users (id, username, password, role)
VALUES (1, 'admin', 'admin123', 'admin')`);

// LOGIN


  app.get("/bookings", (req, res) => {
    const hall = req.query.hall;

    let query = `SELECT * FROM bookings WHERE status='APPROVED'`;
    let params = [];

    if (hall && hall !== "ALL") {
        query += ` AND hall=?`;
        params.push(hall);
    }

    console.log("Filter hall:", hall);

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// BOOKING
app.post("/book", (req, res) => {
    const { hall, startDate, startTime, endDate, endTime, user, subject, mobile } = req.body;

    console.log("Incoming:", req.body);

    // ✅ Required fields
    if (!hall || !startDate || !startTime || !endDate || !endTime || !user || !subject || !mobile) {
        return res.status(400).json({ error: "Missing fields" });
    }

    // 📱 Mobile validation (SERVER SIDE)
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(mobile)) {
        return res.json({ error: "Invalid mobile number" });
    }

    const newStart = new Date(`${startDate}T${startTime}`);
    const newEnd = new Date(`${endDate}T${endTime}`);
    const now = new Date();

    // 🚫 Prevent backdate booking
    if (newStart < now) {
        return res.json({ error: "Cannot book past date/time" });
    }

    // 🚫 Invalid time range
    if (newStart >= newEnd) {
        return res.json({ error: "End time must be after start time" });
    }

    // 🔒 Clash detection
    db.all(`SELECT * FROM bookings WHERE hall=? AND status='APPROVED'`, [hall], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        const clash = rows.find(b => {
            const existingStart = new Date(`${b.startDate}T${b.startTime}`);
            const existingEnd = new Date(`${b.endDate}T${b.endTime}`);
            return (newStart < existingEnd && newEnd > existingStart);
        });

        if (clash) {
            return res.json({
                error: `Clash with existing booking (${clash.startTime} - ${clash.endTime})`
            });
        }

        // ✅ INSERT
        db.run(`
            INSERT INTO bookings 
            (hall, startDate, startTime, endDate, endTime, user, subject, mobile, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [hall, startDate, startTime, endDate, endTime, user, subject, mobile, "APPROVED"],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});
// GET BOOKINGS


// APPROVE / REJECT
app.post("/approve", (req, res) => {
    const { id, status } = req.body;

    db.run(`UPDATE bookings SET status=? WHERE id=?`, [status, id]);

    
    res.json({ success: true });
});


// DELETE
app.post("/deleteBooking", (req, res) => {
    const { id } = req.body;

    console.log("Delete request ID:", id); // debug

    db.run(`DELETE FROM bookings WHERE id=?`, [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });

        res.json({ success: true });
    });
});      

// START SERVER
app.listen(3000, () => console.log("Server running on port 3000"));
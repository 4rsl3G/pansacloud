import express from "express";
import http from "http";
import path from "path";
import dotenv from "dotenv";
import helmet from "helmet";
import session from "express-session";
import MySQLSessionFactory from "express-mysql2-session";
import expressLayouts from "express-ejs-layouts";
import { Server } from "socket.io";

import { pool } from "./db.js";
import { authRouter } from "./routes/auth.routes.js";
import { dashboardRouter } from "./routes/dashboard.routes.js";
import { filesRouter } from "./routes/files.routes.js";
import { downloadRouter } from "./routes/download.routes.js";
import { adminRouter } from "./routes/admin.routes.js";
import { startWa } from "./wa/waClient.js";

dotenv.config();

const app = express();

// security headers
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      frameAncestors: ["'self'"],
      objectSrc: ["'none'"],

      // ALLOW CDN SCRIPTS
      scriptSrc: [
        "'self'",
        "https://code.jquery.com",
        "https://cdn.tailwindcss.com",
        "https://cdnjs.cloudflare.com"
      ],

      // kalau kamu pakai inline script di EJS (kamu pakai!)
      scriptSrcAttr: ["'self'", "'unsafe-inline'"],

      // CSS + inline style
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://fonts.googleapis.com",
        "https://cdnjs.cloudflare.com",
        "https://cdn.jsdelivr.net"
      ],

      // fonts
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com",
        "https://cdn.jsdelivr.net",
        "data:"
      ],

      // images
      imgSrc: ["'self'", "data:"],

      // AJAX + socket.io
      connectSrc: ["'self'", "https://pansa.my.id", "wss://pansa.my.id"],

      // allow form submit to self (login/register masih ajax, tapi aman)
      formAction: ["'self'"],

      upgradeInsecureRequests: []
    }
  }
}));

// body parsers
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// layouts
app.set("view engine", "ejs");
app.set("views", path.resolve("src/views"));
app.use(expressLayouts);
app.set("layout", "layouts/main");

// static
app.use("/public", express.static(path.resolve("public")));

// session store (MySQL)
const MySQLStore = MySQLSessionFactory(session);

const sessionStore = new MySQLStore(
  {
    clearExpired: true,
    checkExpirationInterval: 15 * 60 * 1000, // 15 menit
    expiration: 7 * 24 * 60 * 60 * 1000,     // 7 hari
    // schema: { tableName: 'sessions' } // optional (default "sessions")
  },
  pool
);

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      // secure: true, // aktifkan kalau sudah pakai HTTPS
      // maxAge: 7 * 24 * 60 * 60 * 1000
    },
  })
);

// SPA nav flag + locals
app.use((req,res,next)=>{
  res.locals.isAjaxNav = req.get("X-PANSACLOUD-NAV") === "1";
  res.locals.sessionUser = req.session.user || null;
  res.locals.path = req.path;
  next();
});

// home
app.get("/", (req, res) =>
  req.session?.user ? res.redirect("/dashboard") : res.redirect("/login")
);

// routes
app.use(authRouter);
app.use(dashboardRouter);
app.use(filesRouter);
app.use(downloadRouter);
app.use(adminRouter);

// server + socket
const server = http.createServer(app);
const io = new Server(server);

io.on("connection", (socket) => {
  socket.emit("wa:status", { status: "waiting" });
});

server.listen(Number(process.env.PORT || 3001), async () => {
  await startWa(io, process.env.WA_SESSION_NAME || "main");
  console.log("PansaCloud:", process.env.APP_BASE_URL);
});

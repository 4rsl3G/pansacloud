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

// Supaya cookie secure tetap dikirim walau behind Cloudflare
app.set("trust proxy", 1);

// Security headers + CSP allow CDN
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'"],
        objectSrc: ["'none'"],
        scriptSrc: [
          "'self'",
          "https://code.jquery.com",
          "https://cdn.tailwindcss.com",
          "https://cdnjs.cloudflare.com",
        ],
        scriptSrcAttr: ["'self'", "'unsafe-inline'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
          "https://cdnjs.cloudflare.com",
          "https://cdn.jsdelivr.net",
        ],
        fontSrc: [
          "'self'",
          "https://fonts.gstatic.com",
          "https://cdn.jsdelivr.net",
          "data:",
        ],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "https://pansa.my.id", "wss://pansa.my.id"],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
  })
);

// Body parser
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// EJS + layouts
app.set("view engine", "ejs");
app.set("views", path.resolve("src/views"));
app.use(expressLayouts);
app.set("layout", "layouts/main");

// Static folder public (di root project)
app.use("/public", express.static(path.resolve("public")));

// Session store MySQL
const MySQLStore = MySQLSessionFactory(session);
const sessionStore = new MySQLStore(
  {
    clearExpired: true,
    checkExpirationInterval: 15 * 60 * 1000,
    expiration: 7 * 24 * 60 * 60 * 1000,
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
      secure: true, // karena kamu pakai HTTPS Cloudflare
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

// Inject locals untuk view
app.use((req, res, next) => {
  res.locals.isAjaxNav = req.get("X-PANSACLOUD-NAV") === "1";
  res.locals.sessionUser = req.session?.user || null;
  res.locals.path = req.path;
  next();
});

// Redirect home
app.get("/", (req, res) =>
  req.session?.user ? res.redirect("/dashboard") : res.redirect("/login")
);

// Mount routers
app.use(authRouter);
app.use(dashboardRouter);
app.use(filesRouter);
app.use(downloadRouter);
app.use("/admin", adminRouter);

// Setup server + socket.io
const server = http.createServer(app);
const io = new Server(server, { transports: ["websocket", "polling"] });

io.on("connection", (socket) => {
  socket.emit("wa:status", { status: "waiting" });
});

// Start WhatsApp admin pair
server.listen(Number(process.env.PORT || 3001), async () => {
  await startWa(io, process.env.WA_SESSION_NAME || "main");
  console.log("PansaCloud:", process.env.APP_BASE_URL);
});

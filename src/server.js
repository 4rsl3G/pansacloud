import express from "express";
import http from "http";
import path from "path";
import dotenv from "dotenv";
import helmet from "helmet";
import session from "express-session";
import MySQLStoreFactory from "connect-mysql2";
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
app.use(helmet());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// layouts
app.set("view engine", "ejs");
app.set("views", path.resolve("views"));
app.use(expressLayouts);
app.set("layout", "layouts/main");

// public
app.use("/public", express.static(path.resolve("public")));

// session store mysql
const MySQLStore = MySQLStoreFactory(session);
const sessionStore = new MySQLStore({}, pool);
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: { httpOnly: true, sameSite: "lax" }
}));

// SPA nav flag + locals
app.use((req,res,next)=>{
  res.locals.isAjaxNav = req.get("X-PANSACLOUD-NAV") === "1";
  res.locals.sessionUser = req.session.user || null;
  next();
});

app.get("/", (req,res)=> req.session.user ? res.redirect("/dashboard") : res.redirect("/login"));

app.use(authRouter);
app.use(dashboardRouter);
app.use(filesRouter);
app.use(downloadRouter);
app.use(adminRouter);

const server = http.createServer(app);
const io = new Server(server);

io.on("connection", (socket) => {
  socket.emit("wa:status", { status: "waiting" });
});

server.listen(Number(process.env.PORT||3001), async ()=>{
  await startWa(io, process.env.WA_SESSION_NAME || "main");
  console.log("PansaCloud:", process.env.APP_BASE_URL);
});

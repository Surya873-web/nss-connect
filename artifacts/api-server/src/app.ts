import express, { type Express } from "express";
import path from "node:path";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000");
  }
  next();
});
app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: true, limit: "64kb" }));

app.use("/api", router);

if (process.env.NODE_ENV === "production") {
  const clientDirectory = path.resolve(
    __dirname,
    "../../nss-connect/dist/public",
  );
  app.use(express.static(clientDirectory));
  app.use((req, res, next) => {
    if (
      req.method !== "GET" ||
      !req.accepts("html") ||
      req.path === "/api" ||
      req.path.startsWith("/api/")
    ) {
      next();
      return;
    }

    res.sendFile(path.join(clientDirectory, "index.html"), (error) => {
      if (error) next(error);
    });
  });
}

export default app;

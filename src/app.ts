import express from "express";
import loggerMiddleware from "./middlewares/logger.middleware";
import { SuccessResponseHandler } from "./handlers/success.handler"

const app = express();

app.use(loggerMiddleware);
app.use(express.json());

app.get("/health", (_request, response) => {
  SuccessResponseHandler(response, { status: "ok" });
});

export default app;

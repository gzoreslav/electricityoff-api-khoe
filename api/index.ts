import express from "express";
import { khoeService } from "../src/services/khoe/khoe";

const app = express();

app.get("/api/v1", (_req, res) => res.send("KHOE API Status: OK"));

const sendSchedule = async (_req: express.Request, res: express.Response) => {
  try {
    res.send(await khoeService.getSchedule());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load schedule";
    res.status(500).send({ error: message });
  }
};

app.get("/api/v1/off", sendSchedule);
app.get("/khoe", sendSchedule);

app.listen(process.env.PORT || 3010, () => console.log("Server is ready"));

module.exports = app;

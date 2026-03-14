import express, { Request, Response } from "express";

const app = express();
const PORT = process.env.PORT ?? 8082;

app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", version: "node", service: "api-node" });
});

app.listen(PORT, () => {
  console.log(`[api-node] running on port ${PORT}`);
});

export default app;

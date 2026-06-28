// Load .env (DATABASE_URL, AUTH_SECRET/NEXTAUTH_SECRET) BEFORE anything that
// reads process.env — this import must stay first.
import "dotenv/config";
import { createApp } from "./app";

const PORT = Number(process.env.PORT) || 4000;

const app = createApp();

app.listen(PORT, () => {
  console.log(`BookIt API (Express) listening on http://localhost:${PORT}`);
});

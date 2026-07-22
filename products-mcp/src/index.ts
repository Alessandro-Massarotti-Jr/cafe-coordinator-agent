import "dotenv/config";
import { server } from "./server";

const PORT = process.env["PORT"] ?? 3001;
server.listen(PORT, () => {
  console.log(`Products MCP server running on port ${PORT}`);
});

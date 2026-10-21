// Side-effect module: import it first in index.ts so the variables are set
// before any other module reads process.env during evaluation.
// `.env.local` (secrets, per the docs) wins; `.env` fills in anything unset.
// Both resolve against the working directory and never override real env vars.
import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

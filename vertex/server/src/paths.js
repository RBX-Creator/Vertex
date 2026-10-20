import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// vertex/ – Wurzel des Systems (core/, brain-template/, ui/, config/ …)
export const ROOT = path.resolve(here, "..", "..");
export const CORE_DIR = path.join(ROOT, "core");
export const TEMPLATE_DIR = path.join(ROOT, "brain-template");
export const UI_DIR = path.join(ROOT, "ui");
export const ENV_FILE = path.join(ROOT, "config", ".env");

// Laufzeitdaten (Profile, Gedächtnisse, Verläufe). Nie ins Git – siehe .gitignore.
export const DATA_DIR = path.resolve(process.env.VERTEX_DATA_DIR || path.join(ROOT, "data"));
export const TEAM_DIR = path.join(DATA_DIR, "team");
export const USERS_DIR = path.join(DATA_DIR, "users");

export const userDir = (id) => path.join(USERS_DIR, id);

// Listen der Business-Werkzeuge als JSON: Lager und Kunden fürs Team, Aufgaben und Ernährung pro Person.
// Bewusst neben den Gedächtnis-Ordnern (TEAM_DIR, users/<id>/ich), nicht darin – sonst könnte das
// Memory-Tool die Listen lesen, per str_replace verbiegen oder löschen.
export const TEAM_LISTEN_DIR = path.join(DATA_DIR, "team-listen");
export const userListenDir = (id) => path.join(userDir(id), "listen");

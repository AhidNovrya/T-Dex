CREATE TABLE app_state (id TEXT PRIMARY KEY NOT NULL, version INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE sessions (token TEXT PRIMARY KEY NOT NULL, username TEXT NOT NULL, expires INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE rate_limits (id TEXT PRIMARY KEY NOT NULL, count INTEGER NOT NULL DEFAULT 0, expires INTEGER NOT NULL);

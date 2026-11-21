CREATE TABLE coalition_records (id TEXT PRIMARY KEY, name TEXT NOT NULL, waves INTEGER NOT NULL, views INTEGER NOT NULL, combo INTEGER NOT NULL DEFAULT 0, assisted INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE INDEX coalition_records_rank ON coalition_records(views DESC, waves DESC);

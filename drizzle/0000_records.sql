CREATE TABLE records (id TEXT PRIMARY KEY, name TEXT NOT NULL, difficulty TEXT NOT NULL, wave INTEGER NOT NULL, score INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX records_rank ON records(difficulty, wave DESC, score DESC);

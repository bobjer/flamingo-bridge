CREATE TABLE ranked_runs (id TEXT PRIMARY KEY, board TEXT NOT NULL, wave INTEGER NOT NULL, score INTEGER NOT NULL, assisted INTEGER NOT NULL, started INTEGER NOT NULL, updated INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX ranked_expiry ON ranked_runs(updated);
--> statement-breakpoint
CREATE TABLE ranked_limits (key TEXT PRIMARY KEY, bucket INTEGER NOT NULL, hits INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX ranked_limit_expiry ON ranked_limits(bucket);

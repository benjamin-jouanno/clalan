import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { sql } from 'drizzle-orm';

const databaseUrl = process.env['DATABASE_URL'] ?? './data/clalan.sqlite';
mkdirSync(dirname(databaseUrl), { recursive: true });

const sqlite = new Database(databaseUrl);
sqlite.pragma('journal_mode = WAL');

const userColumns = sqlite
  .prepare('PRAGMA table_info(users)')
  .all() as Array<{ name: string; notnull: number }>;
const usernameColumn = userColumns.find((column) => column.name === 'username');

if (userColumns.length > 0 && (!usernameColumn || usernameColumn.notnull !== 1)) {
  sqlite.exec(`
    ALTER TABLE users RENAME TO users_legacy;
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    INSERT INTO users (id, username, email, password_hash, created_at)
    SELECT id,
      lower(substr(email, 1, instr(email, '@') - 1)) || '_' || id,
      email,
      password_hash,
      created_at
    FROM users_legacy;
    DROP TABLE users_legacy;
  `);
}

export const db = drizzle(sqlite);

db.run(sql`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    faction TEXT,
    character_name TEXT,
    race TEXT,
    class_name TEXT,
    role TEXT
  )
`);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author_id INTEGER NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES posts(id),
    author_id INTEGER NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS post_upvotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES posts(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    UNIQUE(post_id, user_id)
  );
`);

const columns = sqlite.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
const columnNames = new Set(columns.map((column) => column.name));
for (const [name, definition] of [
  ['faction', 'TEXT'],
  ['character_name', 'TEXT'],
  ['race', 'TEXT'],
  ['class_name', 'TEXT'],
  ['role', 'TEXT'],
] as const) {
  if (!columnNames.has(name)) {
    sqlite.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
  }
}

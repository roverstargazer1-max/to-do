-- Migration 002: Habits, Focus Logs, and Calendar Events

CREATE TABLE IF NOT EXISTS habits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'local_user',
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#4B6CB7',
  icon TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  start_date TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  habit_type TEXT NOT NULL DEFAULT 'boolean',
  frequency_count INTEGER,
  frequency_period TEXT DEFAULT 'day',
  target_type TEXT DEFAULT 'at_least',
  target_value REAL,
  unit TEXT,
  source_uuid TEXT
);

CREATE TABLE IF NOT EXISTS habit_entries (
  id TEXT PRIMARY KEY,
  habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  value REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE(habit_id, date)
);

CREATE TABLE IF NOT EXISTS focus_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'local_user',
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  session_type TEXT DEFAULT 'focus',
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'local_user',
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#4B6CB7',
  category TEXT,
  recurrence_rule TEXT,
  remote_id TEXT,
  remote_calendar_id TEXT,
  etag TEXT,
  ics_uid TEXT,
  sync_state TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_habit_entries_habit_id ON habit_entries(habit_id);
CREATE INDEX IF NOT EXISTS idx_habit_entries_date ON habit_entries(date);
CREATE INDEX IF NOT EXISTS idx_focus_logs_task_id ON focus_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_focus_logs_start_time ON focus_logs(start_time);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start_time ON calendar_events(start_time);
CREATE INDEX IF NOT EXISTS idx_calendar_events_end_time ON calendar_events(end_time);

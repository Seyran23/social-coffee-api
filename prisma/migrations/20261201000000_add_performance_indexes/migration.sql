CREATE INDEX IF NOT EXISTS "users_deleted_at_idx" ON "users"("deleted_at");
CREATE INDEX IF NOT EXISTS "users_created_at_idx" ON "users"("created_at");
CREATE INDEX IF NOT EXISTS "chat_sessions_status_expires_at_idx" ON "chat_sessions"("status", "expires_at");
CREATE INDEX IF NOT EXISTS "messages_chat_session_id_created_at_idx" ON "messages"("chat_session_id", "created_at");

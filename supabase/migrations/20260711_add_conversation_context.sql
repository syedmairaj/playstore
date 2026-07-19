-- Migration: Add Conversation Context Table
-- Date: 2026-07-11
-- Purpose: Store contextual state for multi-turn support conversations
--
-- This table enables the AI support agent to understand ambiguous references
-- like "what is in this order?" by maintaining conversation context across
-- multiple turns.

CREATE TABLE IF NOT EXISTS public.conversation_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL,
  active_order_id UUID,
  active_app_id UUID,
  active_keyword_id UUID,
  active_review_id UUID,
  active_listing_id UUID,
  context_type TEXT CHECK (context_type IN ('order', 'app', 'keyword', 'review', 'listing')),
  context_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure one context per conversation per workspace
  UNIQUE(workspace_id, conversation_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_conversation_context_workspace_id
  ON public.conversation_context(workspace_id);

CREATE INDEX IF NOT EXISTS idx_conversation_context_conversation_id
  ON public.conversation_context(conversation_id);

CREATE INDEX IF NOT EXISTS idx_conversation_context_updated_at
  ON public.conversation_context(updated_at DESC);

-- Enable RLS (Row Level Security)
ALTER TABLE public.conversation_context ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see context for their workspaces
CREATE POLICY "Users can access conversation context for their workspaces"
  ON public.conversation_context
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_members.workspace_id = conversation_context.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

-- Trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_conversation_context_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF NOT EXISTS trigger_conversation_context_timestamp ON public.conversation_context;

CREATE TRIGGER trigger_conversation_context_timestamp
  BEFORE UPDATE ON public.conversation_context
  FOR EACH ROW
  EXECUTE FUNCTION public.update_conversation_context_timestamp();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_context TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

-- Comment on table
COMMENT ON TABLE public.conversation_context IS 'Stores conversation context for multi-turn support interactions. Tracks active entities (orders, apps, keywords, etc.) so the AI can resolve ambiguous references like "this order" or "my app".';

COMMENT ON COLUMN public.conversation_context.conversation_id IS 'Unique identifier for this conversation (e.g., chat session ID, thread ID)';
COMMENT ON COLUMN public.conversation_context.context_type IS 'Type of entity currently in focus (order, app, keyword, review, listing)';
COMMENT ON COLUMN public.conversation_context.context_timestamp IS 'When the context was last explicitly changed by the user';
COMMENT ON COLUMN public.conversation_context.updated_at IS 'Last update time (can be updates to any field)';

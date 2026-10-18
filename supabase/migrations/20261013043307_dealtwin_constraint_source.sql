-- Preserve quoted provenance across repository instances. Legacy policy/seed
-- constraints retain NULL; proof payloads and historical hashes are unchanged.
alter table public.dealtwin_constraints
  add column source_text text,
  add constraint dealtwin_constraints_source_text_check check (
    source_text is null or (
      char_length(source_text) between 1 and 3000
      and source_text = btrim(source_text)
    )
  );
comment on column public.dealtwin_constraints.source_text is
  'Quoted user source; untrusted data, never authority for cash, approval or feasibility.';

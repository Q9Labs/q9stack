// ruleid: q9.typescript.no-optional-boolean-flag-pairs
interface ViewState {
  isLoading?: boolean;
  isError?: boolean;
}

// ok: q9.typescript.no-optional-boolean-flag-pairs
interface ExplicitViewState {
  status: "loading" | "error" | "ready";
  isStale?: boolean;
}

void ViewState;
void ExplicitViewState;

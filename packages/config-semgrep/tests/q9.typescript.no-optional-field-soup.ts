// ruleid: q9.typescript.no-optional-field-soup
interface SearchRequest {
  query?: string;
  page?: number;
  sort?: string;
  direction?: "asc" | "desc";
}

// ok: q9.typescript.no-optional-field-soup
interface LoadingState {
  kind: "loading";
  query?: string;
  page?: number;
  sort?: string;
  direction?: "asc" | "desc";
}

// ok: q9.typescript.no-optional-field-soup
interface SearchOptions {
  query?: string;
  page?: number;
  sort?: string;
  direction?: "asc" | "desc";
}

// ok: q9.typescript.no-optional-field-soup
type ButtonProps = {
  size?: "sm" | "md";
  variant?: string;
  disabled?: boolean;
  loading?: boolean;
};

void SearchRequest;
void SearchOptions;
void ButtonProps;
void LoadingState;

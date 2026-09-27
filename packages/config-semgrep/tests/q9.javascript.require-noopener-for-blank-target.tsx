declare const url: string;

// ruleid: q9.javascript.require-noopener-for-blank-target
const unsafe = (
  <a href={url} target="_blank">
    Open
  </a>
);

// ok: q9.javascript.require-noopener-for-blank-target
const safe = (
  <a href={url} target="_blank" rel="noopener noreferrer">
    Open
  </a>
);

void unsafe;
void safe;

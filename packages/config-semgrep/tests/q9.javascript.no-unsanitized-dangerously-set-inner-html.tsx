declare const html: string;

// ruleid: q9.javascript.no-unsanitized-dangerously-set-inner-html
const unsafe = <div dangerouslySetInnerHTML={{ __html: html }} />;

declare const DOMPurify: { sanitize(value: string): string };

// ok: q9.javascript.no-unsanitized-dangerously-set-inner-html
const safe = <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />;

void unsafe;
void safe;

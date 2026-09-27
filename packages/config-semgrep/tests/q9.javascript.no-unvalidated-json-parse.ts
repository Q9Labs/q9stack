declare const input: string;

const parsed = JSON.parse(input);

// ruleid: q9.javascript.no-unvalidated-json-parse
const userName = parsed.user.name;

declare function validate(value: unknown): { user: { name: string } };

const validated = validate(JSON.parse(input));

// ok: q9.javascript.no-unvalidated-json-parse
const validatedUserName = validated.user.name;

declare const schema: {
  safeParse(value: unknown): { success: boolean; data: { user: { name: string } } };
};
declare function decodeUnknownSync(value: unknown): { user: { name: string } };

const checked = schema.safeParse(JSON.parse(input));

// ok: q9.javascript.no-unvalidated-json-parse
const checkedUserName = checked.data.user.name;

const decoded = decodeUnknownSync(JSON.parse(input));

// ok: q9.javascript.no-unvalidated-json-parse
const decodedUserName = decoded.user.name;

declare const response: { body: string };

// ok: q9.javascript.no-unvalidated-json-parse
const fromResponse = decodeUnknownSync(JSON.parse(response.body));

const raw = JSON.parse(input);
// ruleid: q9.javascript.no-unvalidated-json-parse
const rawTitle = raw["title"];

void userName;
void validatedUserName;
void checkedUserName;
void decodedUserName;
void rawTitle;
void fromResponse;

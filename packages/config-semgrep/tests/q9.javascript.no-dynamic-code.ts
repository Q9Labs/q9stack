declare const source: string;

// ruleid: q9.javascript.no-dynamic-code
const evaluated = eval(source);

// ruleid: q9.javascript.no-dynamic-code
const generated = new Function("value", source);

void evaluated;
void generated;

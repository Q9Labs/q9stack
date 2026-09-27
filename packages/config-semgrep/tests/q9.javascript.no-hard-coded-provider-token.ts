// ruleid: q9.javascript.no-hard-coded-provider-token
const openRouterKey = "sk-abcdefghijklmnop1234"; // gitleaks:allow

// ruleid: q9.javascript.no-hard-coded-provider-token
const awsAccessKey = "AKIA1234567890ABCDEF"; // gitleaks:allow

// ok: q9.javascript.no-hard-coded-provider-token
const runtimeKey = process.env.PROVIDER_KEY;

void openRouterKey;
void awsAccessKey;
void runtimeKey;
